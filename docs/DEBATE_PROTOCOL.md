# ManthanOS — Debate Protocol

> The mechanism by which multiple agents collaborate, disagree, and
> produce a higher-quality engineering outcome than any single agent
> could alone. Status: design lock — pre-implementation.

---

## 1. Why debate is first-class

Most multi-agent tools treat "debate" as an unstructured chain of
prompts. The output is hard to evaluate, impossible to replay, and
expensive without obvious improvement over a single strong model.

ManthanOS treats debate as a **state machine over a fixed protocol**.
This gives the runtime four properties chat-style debates lack:

1. **Replayable.** Each round's inputs and outputs are content-
   addressed; a debate can be re-run against a snapshot.
2. **Inspectable.** The transcript has a stable schema; tools can
   summarize, diff, and search across debates.
3. **Budgetable.** Token and dollar budgets are enforced at round
   boundaries.
4. **Compoundable.** A debate's outcome lands in the project brain
   as a structured artifact (decisions, open issues, arbiter result),
   which subsequent workflows can read.

A debate is not "ask three models and average." It is a program over
the project brain whose final state is a structured arbiter result.

---

## 2. Vocabulary

**Protocol** — the state machine definition. Specifies rounds, roles,
arbiter, and budget. Stored under `packages/core/src/debate/protocols/`
and `.manthan/protocols/` for user-defined variants.

**Round** — one transition in the state machine. Has a role (or set
of roles, in parallel), an input view, and an output schema.

**Role** — what a model is being asked to do in a round (architect,
implementer, critic, adversary, arbiter). Roles are mapped to
adapters by the routing engine.

**Participant** — an adapter playing a role in this debate.

**Arbiter** — the final role. Synthesizes the debate into a
structured outcome. Usually a different model from any participant.

**Transcript** — append-only JSONL record of all events.

---

## 3. Protocol as a state machine

A protocol is a function from `(brain snapshot, task brief, prior
rounds)` to `next round | done`. In practice we represent it as a
declarative spec:

```ts
export interface DebateProtocol {
  id: string;                    // e.g. "architecture.v1"
  description: string;
  rounds: RoundSpec[];
  arbiter: ArbiterSpec;
  budget: BudgetSpec;
}

export interface RoundSpec {
  index: number;
  role: RoleId;                  // 'architect' | 'implementer' | ...
  parallel?: boolean;            // multiple participants in this role
  inputs: InputSelector;         // which prior outputs are visible
  outputSchema?: Record<string, unknown>; // optional Zod/JSON schema
  capabilityRequirements: CapabilityRequirements;
  maxTokens?: number;
}

export interface ArbiterSpec {
  role: 'arbiter';
  outputSchema: typeof ArbiterResultSchema;
  capabilityRequirements: CapabilityRequirements;
  /** Refuse to use an adapter that participated in earlier rounds. */
  excludeParticipants?: boolean;
}

export interface BudgetSpec {
  maxUsd: number;
  maxTotalTokens: number;
  maxRoundLatencyMs?: number;
}
```

`InputSelector` describes which prior round outputs are visible to
this round (e.g., "all prior", "only architect", "only implementer
and critic"). This is what prevents information leakage from changing
the protocol semantics.

---

## 4. Roles vs models

Roles are protocol-level. Models are adapter-level. The routing
engine maps roles to adapters at runtime based on capability
requirements and project preferences.

A user can override the mapping in `.manthan/config.yaml`:

```yaml
debate:
  protocols:
    architecture.v1:
      role_map:
        architect: anthropic:claude-opus-4-7
        implementer: openai:o-series
        critic: google:gemini-2.5-pro
        adversary: xai:grok-x
        arbiter: anthropic:claude-opus-4-7
      excluded_arbiters: [openai:o-series]
```

If no mapping is provided, the routing engine selects automatically
from registered adapters using capability requirements.

---

## 5. Default protocols

Three protocols ship in MVP. They cover the most common engineering
tasks.

### 5.1 `architecture.v1`

For: design decisions, refactor plans, technology choices.

| Round | Role | Sees |
|-------|------|------|
| 0 | context packer | n/a (system step) |
| 1 | architect | charter + brief + relevant code + decision log |
| 2 | implementer | round 1 |
| 3 | critic | rounds 1 + 2 |
| 4 | adversary | rounds 1 + 2 + 3 |
| 5 | arbiter | all prior rounds |

Default budget: $0.50 (configurable). For a serious refactor, the
user raises it explicitly.

### 5.2 `review.v1`

For: code review of a diff.

| Round | Role | Sees |
|-------|------|------|
| 0 | context packer | diff + tests for changed code + decisions |
| 1 | reviewer-a | context |
| 1 | reviewer-b | context (parallel with reviewer-a) |
| 2 | adversary | both reviewer outputs |
| 3 | arbiter | all prior |

Parallel reviewers come from different model families to reduce
correlated mistakes.

### 5.3 `forensic-debug.v1`

For: explaining a bug, test failure, or production incident.

| Round | Role | Sees |
|-------|------|------|
| 0 | evidence packer | logs, stack traces, recent changes, relevant code |
| 1 | hypothesizer | evidence |
| 2 | evidence-challenger | round 1 (challenges weak evidence chains) |
| 3 | counter-hypothesizer | rounds 1 + 2 |
| 4 | synthesizer | all prior |
| 5 | arbiter | all prior |

The forensic protocol exists specifically to enforce
**evidence before assumptions** — round 2's only job is to identify
which of the hypothesizer's claims are unsupported.

User-defined protocols live in `.manthan/protocols/<name>.protocol.yaml`
and are loaded at workflow start. **YAML only in MVP** — no TS
loading, no dynamic JS execution. Built-in protocols may be authored
in TypeScript inside `packages/core` (compiled at build time); the
constraint applies to user-authored files in `.manthan/`.

---

## 6. The arbiter

The arbiter is the only round whose output schema is **fixed across
all protocols**. This is the artifact that lands in the project
brain and that other workflows consume.

```ts
export const ArbiterResultSchema = z.object({
  consensus: z.array(z.string())
    .describe('Specific points all participants agreed on.'),

  disagreements: z.array(z.object({
    topic: z.string(),
    positions: z.record(z.string(), z.string()), // roleId -> stance
    severity: z.number().int().min(1).max(5),
  })),

  risks: z.array(z.object({
    description: z.string(),
    severity: z.number().int().min(1).max(5),
    likelihood: z.number().int().min(1).max(5),
    mitigation: z.string().optional(),
  })),

  confidence: z.number().min(0).max(1)
    .describe('Arbiter confidence in the recommended action.'),

  recommendedAction:
    z.enum(['proceed', 'revise', 'abort', 'human-decision']),

  rationale: z.string(),

  followUps: z.array(z.object({
    action: z.string(),
    owner: z.enum(['human', 'agent']),
    blocking: z.boolean(),
  })),
});
```

**Excluded participants.** By default, the arbiter is selected from
adapters not already used in earlier rounds. This avoids the model
that argued a position being the judge of it. When no qualified
non-participant is available, the runtime warns and proceeds with
the most-capable participant — but `arbiter.excludedParticipants`
in metadata records the compromise.

**Structured output.** The arbiter call always uses
`outputSchema = ArbiterResultSchema`. Adapters that don't natively
support structured output use the SDK's coercion helper; if coercion
fails twice, the arbiter call retries once with a stricter prompt
and then fails the debate with `recommendedAction = 'human-decision'`.

---

## 7. Transcript format

Transcripts are append-only JSONL at
`.manthan/debates/<debateId>.jsonl`. Stored with LF line endings on
all platforms (PAL ensures).

Each event:

```jsonl
{ "ts": "...", "kind": "debate_start", "protocol": "architecture.v1", "task": "..." }
{ "ts": "...", "kind": "round_start", "round": 1, "role": "architect", "agent": "anthropic:claude-opus-4-7" }
{ "ts": "...", "kind": "agent_request", "round": 1, "messages_hash": "sha256:...", "tokens_estimated": 12871 }
{ "ts": "...", "kind": "agent_response", "round": 1, "text": "...", "usage": {...} }
{ "ts": "...", "kind": "round_end", "round": 1, "duration_ms": 4221 }
...
{ "ts": "...", "kind": "arbiter_result", "result": { ... ArbiterResultSchema ... } }
{ "ts": "...", "kind": "debate_end", "outcome": "proceed", "totals": { "tokens": ..., "usd": ... } }
```

Messages themselves are stored separately by hash in
`.manthan/debates/messages/<hash>.json` to keep the JSONL file small
and to enable cross-debate deduplication.

### 7.1 Canonical JSON encoding (required for replay determinism)

A debate is replayable iff its serialized messages and request
payloads are byte-identical across runs. JSON, by default, is not
canonical — key order, whitespace, number formatting, and Unicode
normalization can all vary between serializers. The protocol fixes
these:

- **Key order:** alphabetical (RFC 8785 JCS compatible), recursive
  through nested objects. Arrays preserve insertion order.
- **Whitespace:** none. No indentation in stored JSON. (Pretty-printing
  is a display-time transform applied by `manthan` view commands.)
- **Unicode:** NFC normalization on all string values. Strings
  containing only ASCII bypass the NFC step for performance.
- **Numbers:** JSON numbers are serialized as their shortest
  round-trip representation. `NaN`, `Infinity`, `-Infinity` are
  forbidden — the encoder rejects them with a precise error.
- **String escapes:** RFC 8259 minimal escapes. Forward slash is
  not escaped. Non-ASCII characters are emitted directly (after NFC
  normalization), not as `\uXXXX` escapes.
- **Trailing newlines:** none in stored files. JSONL files have a
  single trailing newline after the last record.
- **`null` vs absent:** explicit `null` is preserved; absent keys
  are not synthesized.

The PAL `JsonCanon` helper implements this. All persisted JSON
(messages, transcripts, audit blobs, context bundles) goes through
it. Replay verification recomputes hashes via the same helper.

This rules out lazy `JSON.stringify(...)` calls in persistence code.
Lint enforces — direct `JSON.stringify` is forbidden in persistence
paths, only `JsonCanon.stringify` is allowed.

---

## 8. Replay

`manthan debate --replay <debateId>` reconstructs the run without
re-invoking providers. By default, it shows what was sent and
received. With `--re-invoke`, it makes fresh provider calls against
the same packed context — useful for evaluating model improvements
on the same exact task.

Replay is testable and deterministic up to:

- The packed context bundle (deterministic given brain snapshot).
- The adapter request payload (deterministic given context bundle).
- The recorded response (verbatim from transcript).
- The arbiter's structured output (verbatim).

This is the basis for the eval harness (MVP_ROADMAP §6).

---

## 9. Budgets & guardrails

Three layers of budget:

1. **Workflow budget** — set by the caller (`manthan debate
   --budget 0.50`). Aggregates across all rounds.
2. **Round budget** — automatic split of workflow budget, weighted
   by round importance.
3. **Adapter request budget** — `req.budget` enforced by the SDK;
   over-budget requests fail before the network call.

When a round exceeds budget mid-call, the orchestrator aborts that
agent's call (via `AbortSignal`) and either:

- Skips to the arbiter with whatever was collected so far, OR
- Marks the debate as `recommendedAction: 'human-decision'` and
  records the budget exhaustion.

The choice is per-protocol; default is "skip to arbiter" so the user
still gets a partial synthesis.

---

## 10. Concurrency model

- **Rounds are sequential.** Round N depends on round N-1's outputs.
  Sequencing matters; protocols are not DAGs.
- **Within a round, participants run in parallel.** `Promise.all`
  over adapter calls, with per-provider concurrency caps.
- **Cancellation cascades.** An `AbortSignal` at the workflow level
  cancels in-flight rounds, which in turn cancels in-flight adapter
  calls.

The orchestrator never invokes more than one debate in a workspace
concurrently (per-workspace lock). Across workspaces, debates run
independently.

---

## 11. Failure handling

Failure modes and policies:

| Failure | Policy |
|---|---|
| One participant errors | Continue if other participants in the round succeed; record the failure in transcript. If all fail, skip to arbiter with partial state. |
| Arbiter errors | Retry once with stricter prompt; if still fails, surface failure to user as `recommendedAction: 'human-decision'`. |
| Budget exhausted mid-round | Per §9: abort round, skip to arbiter or human-decision. |
| Context overflow | Context packer should have prevented this. If it happens, fail debate; do not silently truncate. |
| User cancels | Save partial transcript; transcript marker `debate_cancelled` written. |

All failures result in a complete transcript with a final event
marking the outcome. There are no "abandoned" debates without a
record.

### 11.1 Arbiter failure semantics (expanded)

The arbiter is the single point through which a debate produces a
binding outcome. Its failure modes deserve precise handling:

**Attempt 1: structured schema enforcement.**
- The arbiter call uses `outputSchema = ArbiterResultSchema`.
- Adapters that natively support structured output (response_format
  schema, tool-call coercion) are preferred for the arbiter role.
- On schema parse failure → Attempt 2.

**Attempt 2: stricter prompt + repair.**
- The arbiter is re-invoked with the original prompt plus the parse
  error and a "produce only valid JSON matching the schema"
  instruction.
- The original (invalid) output is included so the model can
  observe and correct.
- On second parse failure → Attempt 3.

**Attempt 3: fallback to a different adapter.**
- The routing engine selects an alternate adapter satisfying the
  arbiter capability requirements (different model family if
  possible).
- The original participants' outputs and the two failed arbiter
  attempts are included as context.
- On third failure → human-decision outcome.

**Final fallback: human-decision.**
- The debate completes with `outcome: 'human-decision'` and
  `confidence: 0` in the persisted record.
- The transcript captures all three arbiter attempts as evidence.
- The user is presented with a structured summary of the
  participants' outputs and a clear note: "Arbiter failed to
  produce a valid synthesis; human decision required."
- The `corrective_signals` table receives an entry tagged
  `arbiter_failure` so future routing weights this adapter lower
  for arbiter selection.

**Budget exhaustion mid-arbiter.** If budget runs out during an
arbiter attempt, the partial output is preserved and the workflow
transitions directly to `human-decision`. No silent failures, no
half-arbitrated outcomes.

**The reversed-decision feedback loop** (referenced from
ARCHITECTURE.md §7.4): when the user rejects an arbiter's
recommended action at the safety gate, the rejection becomes a
`corrective_signal` row. Future debates in the same area receive
this signal in their context bundle, so the system does not
repeatedly recommend the same rejected plan.

---

## 12. Persistence into the project brain

A successful debate writes:

- The transcript file (already on disk).
- An entry in `debates` table.
- Each `disagreement` of severity ≥3 becomes an `open_issue` until
  the user explicitly resolves it.
- `consensus` items of recurring type become candidate
  `semantic_facts` (promoted only after appearing in 2+ debates).
- `decisions` rows are inserted only when the user runs
  `manthan decision sign <debateId>`, which produces a signed
  decision record that subsequent workflows can rely on.

The brain learns from debate. Unsigned debates inform but do not
bind future workflows.

---

## 13. Custom protocols

A user creates a custom protocol by adding
`.manthan/protocols/<name>.protocol.yaml`:

```yaml
id: security-review.v1
description: Adversarial security review of a diff.
rounds:
  - index: 1
    role: threat-modeler
    inputs: context
    capability_requirements:
      reasoning_strength: 4
  - index: 2
    role: attacker
    inputs: all-prior
    capability_requirements:
      reasoning_strength: 4
  - index: 3
    role: defender
    inputs: all-prior
    capability_requirements:
      reasoning_strength: 4
arbiter:
  role: arbiter
  output_schema_ref: '#/schemas/ArbiterResult'
  exclude_participants: true
  capability_requirements:
    reasoning_strength: 5
budget:
  max_usd: 1.00
  max_total_tokens: 200000
```

The protocol is loaded at workflow start, validated against the
canonical schema, and rejected with a precise error if invalid.
YAML keys use snake_case; the loader normalizes to the TypeScript
camelCase shape internally.

---

## 14. Anti-patterns (do not do)

- **Free-form debate.** No "have the models chat for N turns." The
  state machine is the entire surface.
- **Self-arbitration.** A participant arbitrating its own round is
  permitted only when no other adapter is available; flagged in
  metadata.
- **Hidden context.** Every round's `inputs` selector is declared.
  No "and also pass this through under the hood."
- **Implicit budgets.** Every debate has an explicit budget or the
  CLI refuses to run it.
- **Provider-locked debates.** A debate that hardcodes
  `provider: 'anthropic'` is rejected at config-load time. Roles
  bind to capabilities; users may pin specific adapters, but the
  protocol itself must remain provider-agnostic.

---

## 15. Cross-platform notes

- Transcripts are LF-only JSONL. PAL ensures consistent encoding
  across Windows/macOS/Linux.
- Filenames in `.manthan/debates/` use only `[a-z0-9-]` characters
  to avoid Windows-reserved character issues.
- Debate IDs are ULID; safe across all filesystems.
- Long-running debates that span hours respect platform-specific
  signal handling (PAL `signals.onTermination` ensures graceful
  shutdown on Windows console-close as well as POSIX SIGTERM).

---

## 16. Open questions

- Whether to allow **conditional rounds** (round N runs only if
  round N-1's confidence is below a threshold). Likely yes in v2;
  adds complexity to replay determinism that we want to think
  through.
- Whether to support **streaming arbitration** (arbiter receives
  prior rounds as they complete, rather than at the end). Trade-off
  against transcript clarity.
- Whether **human-in-the-loop rounds** (a round where the user
  contributes text) belong in MVP. Tentatively yes — they are easy
  to model as another role.
