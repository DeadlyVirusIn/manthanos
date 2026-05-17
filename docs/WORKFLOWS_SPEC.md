# ManthanOS — Workflows Specification

> The format, lifecycle, and semantics of workflows.
> Status: design lock — pre-implementation.

---

## 1. What a workflow is

A workflow is a **deterministic state machine** that the
orchestrator executes against the project brain. It consumes inputs
(task brief, brain snapshot, user decisions) and produces outputs
(plans, debates, diffs, decisions) that are persisted back into the
brain.

Workflows are **programs over the project brain**. They are:

- **Authored** as declarative state machines, not imperative scripts.
- **Versioned** independently of the runtime.
- **Replayable** given the same brain snapshot and recorded
  decisions.
- **Composable** — workflows may invoke sub-workflows.

The five primitive workflows in MVP (`plan`, `debate`,
`implement`, `review`, `forensic-debug`) are built-in. Users can
define additional workflows by adding files to `.manthan/workflows/`.

---

## 2. State machine model

A workflow is a directed graph of **steps**. Each step has:

- A unique `id` within the workflow.
- A `kind` (one of the step kinds in §5).
- An `inputs` specification (which prior step outputs and brain
  slices to read).
- An `outputs` schema (what this step produces).
- Optional `condition` (when to run this step).
- Optional `retry` policy.

Edges between steps are implicit: step B's `inputs` may reference
step A's `outputs.id`, which creates a dependency. The orchestrator
topologically sorts steps and executes them respecting dependencies.

Cycles are forbidden. Conditional loops are expressed via
sub-workflows or via the `iterate` step kind (§5.6), not via cycles.

**Why state machine and not DAG-with-loops:** replay determinism
requires that the control flow be reconstructible from the recorded
trace. A bounded state machine is reconstructible; an open-ended
loop is not. The `iterate` kind imposes hard bounds.

---

## 3. Workflow lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│   load → validate → resolve-context → execute → finalize     │
└──────────────────────────────────────────────────────────────┘
```

**Load.** The runtime reads the workflow definition from
`packages/core/src/workflows/` (built-in) or
`.manthan/workflows/<id>.workflow.yaml` (user-defined).

**Validate.** The definition is parsed against the workflow schema
(§4). Invalid workflows refuse to run with a precise error.

**Resolve-context.** The brain is queried for inputs the workflow
needs. The result is captured as a content-addressed snapshot used
throughout this run.

**Execute.** Steps run in dependency order. Each step writes its
output to a workflow-local store; downstream steps read from it.
Effectful steps (`action.*`) pass through the safety gate (see §7).

**Finalize.** Outputs are written to the brain. The workflow run is
recorded in `workflow_runs` with status, duration, cost, and a
pointer to the audit log range.

A workflow run is identified by a ULID. Runs are immutable once
finalized. Re-running a workflow produces a new run.

---

## 4. Schema (TypeScript / YAML)

The canonical schema is TypeScript types; YAML and JSON are
representations.

```ts
export interface WorkflowDef {
  // Identifier and versioning.
  id: string;                     // e.g. "plan", "debate", "my-team:weekly-review"
  version: string;                // semver — workflow definition version
  description: string;

  // Inputs the caller must supply at invocation.
  parameters: ParameterDef[];

  // The steps.
  steps: StepDef[];

  // Optional defaults and limits.
  budget?: BudgetDef;             // hard cap on $/tokens
  defaultTimeoutMs?: number;
  outputs: OutputBindingDef[];    // which step outputs become workflow outputs
}

export interface ParameterDef {
  name: string;                   // e.g. "task"
  description: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  schema?: Record<string, unknown>; // JSON schema for 'object'
  required: boolean;
  default?: unknown;
}

export interface StepDef {
  id: string;                     // unique within the workflow
  kind: StepKind;                 // see §5
  inputs: Record<string, InputRef>;
  outputs?: Record<string, unknown>; // optional JSON schema for output validation
  condition?: ConditionExpr;
  retry?: RetryPolicy;
  timeoutMs?: number;
  notes?: string;                 // human-readable rationale; not executed
}

export type InputRef =
  | { kind: 'parameter'; name: string }
  | { kind: 'step'; stepId: string; path?: string }    // path is JSONPath into step output
  | { kind: 'brain'; selector: BrainSelector }          // e.g. recent decisions in area X
  | { kind: 'literal'; value: unknown };

export interface BrainSelector {
  source: 'charter' | 'decisions' | 'open_issues' | 'semantic_facts'
        | 'debates' | 'audit' | 'context_snapshot';
  filter?: Record<string, unknown>;
  limit?: number;
  // selectors are deterministic queries; no embeddings in MVP
}

export type ConditionExpr =
  | { op: 'eq' | 'ne' | 'gt' | 'lt' | 'in'; left: InputRef; right: InputRef | unknown }
  | { op: 'and' | 'or'; expr: ConditionExpr[] }
  | { op: 'not'; expr: ConditionExpr };

export interface RetryPolicy {
  maxAttempts: number;            // hard cap, default 1 (no retry)
  retryOn: AdapterErrorCode[];    // which errors are retryable
  backoffMs?: number;             // initial backoff
}

export interface BudgetDef {
  maxUsd: number;
  maxTotalTokens?: number;
  maxWallClockMs?: number;
  onExceeded: 'fail' | 'fallback';
  fallbackStepId?: string;        // when 'fallback'
}
```

### YAML example (built-in `plan` workflow)

```yaml
id: plan
version: 1.0.0
description: Produce a structured implementation plan for a task brief.
parameters:
  - name: task
    description: One-paragraph engineering goal.
    type: string
    required: true
budget:
  maxUsd: 0.25
  onExceeded: fail
steps:
  - id: pack
    kind: context.pack
    inputs:
      task: { kind: parameter, name: task }
      layers: { kind: literal, value: ['charter', 'brief', 'diff', 'decisions:area=auth'] }
  - id: route
    kind: routing.select
    inputs:
      capability: { kind: literal, value: { reasoningStrength: 4, contextTokens: 100000 } }
      context: { kind: step, stepId: pack }
  - id: invoke
    kind: agent.invoke
    inputs:
      adapter: { kind: step, stepId: route, path: $.adapter }
      context: { kind: step, stepId: pack }
      outputSchema: { kind: literal, value: { $ref: '#/schemas/Plan' } }
  - id: persist
    kind: brain.write
    inputs:
      target: { kind: literal, value: 'tasks' }
      payload: { kind: step, stepId: invoke }
outputs:
  - name: plan
    from: { kind: step, stepId: invoke }
```

---

## 5. Step kinds

A small, closed set of step kinds keeps validation, replay, and
authoring tractable. New kinds require an ADR.

### 5.1 `context.pack`

Builds a context bundle from brain layers + parameters. Pure read.
Output: a content-addressed bundle reference and a token estimate.

### 5.2 `agent.invoke`

Invokes an adapter via the SDK. The adapter, prompt, and budget are
inputs. Output: the `AgentResponse` payload, hashed and stored.

### 5.3 `routing.select`

Selects an adapter for a given capability profile. Output: chosen
adapter ID and selection rationale.

### 5.4 `debate.run`

Runs a debate protocol (separate, structured workflow type — see
DEBATE_PROTOCOL.md). Inputs: protocol ID, participants (optional
overrides), budget. Output: the arbiter result + transcript pointer.

### 5.5 `brain.write`

Writes structured data into a named brain table. The table is
declared, the schema is enforced. Audited.

### 5.6 `iterate`

Bounded loop. Runs a sub-step a fixed maximum number of times,
breaking on a condition. Hard upper bound enforced by the schema
validator (default 5, never > 20 without explicit override).

### 5.7 `action.fs`

A filesystem write or read action. Pass-through to the safety gate.
Inputs declare the action class (`write-local`, etc.); the gate
enforces policy.

### 5.8 `action.shell`

A shell action via the PAL. The command plan is declared, not
composed at runtime. Pass-through to the safety gate.

### 5.9 `action.git`

A git action via the git-workspace package. The action class
(`git-local`, `git-remote`) is declared.

### 5.10 `human.decide`

Pauses the workflow for human input. Renders a prompt and accepts a
structured decision. Decisions are recorded in the audit log and may
be referenced by subsequent steps.

### 5.11 `condition.branch`

Selects one of two named branches based on a `ConditionExpr`. Both
branches are part of the workflow definition (not dynamic).

---

## 6. Inputs, outputs, and bindings

- **All inputs are explicit.** No step reads brain or environment
  data implicitly.
- **All outputs are schema-validated.** Failures abort the workflow
  with a precise error.
- **Step outputs are content-addressed.** Reading the same step's
  output produces the same hash, supporting replay verification.
- **Brain queries are deterministic.** No similarity-search /
  embedding queries in MVP. Selectors are SQL-deterministic.

---

## 7. Human approval semantics

The `human.decide` step is the **only** place a workflow pauses for
the user. Approval gates on `action.*` steps happen automatically
via the safety gate (SAFETY_MODEL.md) — those are not workflow
control flow, they are *enforced policy* within an effectful step.

Workflow authors should never simulate approval via `human.decide`
to bypass the safety gate. The safety gate is non-bypassable; a
`human.decide` step is for substantive product decisions ("which
of these three plans?"), not for safety theater.

Recorded human decisions become part of the replayable trace. A
re-run with `--replay <runId>` replays the same decisions; a re-run
with `--re-prompt-humans` re-asks (useful for testing).

---

## 8. Retry semantics

- Default: **no retry**. Step fails → workflow fails.
- A step may declare `retry` with `maxAttempts` and `retryOn`.
- Only listed `AdapterErrorCode`s are retried (typically
  `rate_limited`, `overloaded`, `network`).
- Retry is **at the step level**, not the workflow level. The
  workflow never auto-retries at the top.
- Each retry attempt is its own audit event with a `retry_of` link.

---

## 9. Failure handling

When a step fails:

1. The error is captured with code, message, and `retriable` flag.
2. If `retry` allows it, retry per policy.
3. Otherwise, the workflow transitions to `failed` state.
4. A `finalize` is still run — outputs to that point are still
   persisted, the brain reflects partial progress.
5. The workflow's `outputs` are computed where possible; missing
   outputs are explicit `null`.
6. A `workflow.failed` event is written to the audit log.

A failed workflow can be **resumed** with `manthan workflow resume
<runId>`. Resume picks up at the failed step with the original
inputs. (Resume is a Phase 3 feature; in Phase 1, failed workflows
restart from scratch.)

---

## 10. Replay behavior

Three replay modes.

### 10.1 `--replay <runId>` (no-network replay)

Reconstructs every step using recorded inputs and recorded outputs.
No provider calls. No filesystem writes. No git operations. Useful
for: debugging, code review, reproducing failures.

### 10.2 `--re-invoke` (live replay, brain snapshot pinned)

Reconstructs context from the recorded brain snapshot (not the
current brain). Re-invokes adapters and re-executes effectful
steps under the safety gate. Useful for: comparing model behavior
over time, calibrating routing, re-evaluating a past decision with
a different adapter.

### 10.3 `--partial <runId>` (resume-style)

Replays steps up to a chosen point, then continues live. Useful
for: bug-bisecting a workflow, exploring "what if" branches.

For all three modes, the audit log records the replay as a new run
with a `replay_of: <runId>` field.

---

## 11. Determinism guarantees (honest)

What replay guarantees:

- The **set of steps executed and their order** is deterministic
  given the same workflow definition, parameters, and recorded
  decisions.
- The **request payloads** sent to adapters are byte-identical for
  the same `(workflow, parameters, brain snapshot)` triple.
- The **brain queries** return identical results given the same
  brain state.
- The **audit log shape** (which events, in what order) is
  identical.

What replay does **not** guarantee:

- **Provider outputs.** Models are stochastic; even temperature=0 is
  not strict reproducibility across model deployments.
- **Wall-clock time.** Replay is faster than live.
- **Bit-for-bit identical brain state** after live replay — provider
  outputs differ, downstream writes differ.

These limits are stated in user-facing error messages when replay
fails an integrity check, so users know what determinism means
operationally.

---

## 12. Workflow versioning

- Workflows use semver. `version` field is required.
- Built-in workflows are versioned independently from the runtime.
- A workflow run records the workflow ID + version. Future replays
  use the **recorded** version, not the current version, unless
  `--use-latest` is passed.
- Breaking changes to a workflow definition require a major bump.
  Deprecated versions are kept around for at least one runtime
  minor release.

---

## 13. Validation rules

The workflow validator rejects definitions that:

- Have unresolved input references (a step references another step
  that doesn't exist or hasn't run yet).
- Contain cycles.
- Declare an `action.*` step without an `actionKind` in inputs.
- Declare a `human.decide` step without an output schema.
- Declare a `budget.onExceeded: 'fallback'` without a `fallbackStepId`.
- Use any step kind not in §5.
- Exceed runtime safety limits (e.g., `iterate.maxAttempts > 20`
  without explicit override flag).

Validation runs at load time and on every CI build for built-in
workflows.

---

## 14. Examples

Three canonical workflow definitions ship with MVP. They live in
`packages/core/src/workflows/`:

- **`plan.workflow.yaml`** — context.pack → routing.select →
  agent.invoke → brain.write.
- **`debate.workflow.yaml`** — context.pack → debate.run →
  brain.write. (Debate internals defined in DEBATE_PROTOCOL.md.)
- **`forensic-debug.workflow.yaml`** — evidence.pack → debate.run
  (forensic protocol) → brain.write → human.decide (mark resolved?).

User workflows in `.manthan/workflows/` follow the same schema and
must validate cleanly at startup.

---

## 15. Open questions

- Whether to support a higher-level workflow composition language
  (workflows-of-workflows with parameter forwarding) in MVP. Tentative
  no — adds complexity without proven need.
- Whether `human.decide` should support multi-modal input (e.g.,
  drag-a-file). Tentative no for MVP — text-only.
- Whether to expose the workflow trace as a queryable view in the
  brain (for cross-workflow analysis). Tentative yes in Phase 3.
- Whether to allow workflows to be authored in `.ts` (with a built-in
  offline compiler) versus `.yaml` only.
  **MVP decision: YAML only, period.** TS workflows require either a
  runtime loader (forbidden in MVP per SAFETY_MODEL §11) or an
  offline compilation step plus distribution of the compiled output.
  Both are deferred until **Phase 5+** with proper sandboxing and
  signed-artifact distribution. Built-in workflows in
  `packages/core/src/workflows/` are authored in TS and compiled at
  build time alongside the rest of the runtime; the YAML-only rule
  governs only files in `.manthan/workflows/`.
