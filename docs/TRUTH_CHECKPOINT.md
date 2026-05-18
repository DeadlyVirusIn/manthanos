# ManthanOS — Truth Checkpoint

> Post-multi-LLM-review stabilization. Separates what is empirically
> validated from what became narrative momentum. Written under explicit
> instruction to not protect the thesis.
> Date: 2026-05-16. Triggered by the /octo:review pass on the same day.
>
> **Note on referenced documents:** This memo references several
> internal positioning, phase-governance, and roadmap documents
> (e.g., POSITIONING.md, POSITIONING_CORRECTION.md, PHASE2_THEORY.md,
> FUTURE_COMMAND_CENTER.md) that have since been moved out of the
> public repo into maintainer-private notes. The references describe
> the project's epistemic history at the time of writing; the
> documents themselves are no longer publicly linkable, by design.

Reading order: this document supersedes any prior framing in
CONTINUITY_THEORY.md or PHASE3_CPT.md where they conflict. Where
those docs say "validated" and this one says "unproven," this one
wins.

---

## 1. VALIDATED — claims backed by direct empirical evidence

Only findings with concrete experimental backing. Confidence band, evidence
source, and known limitations are stated for every entry.

### 1.1 The substrate runs end-to-end on Linux

- **Finding**: A user can `manthan init` a workspace, run `manthan plan
  "<brief>"`, get a structured plan, promote facts, run hygiene
  workflows, and replay recorded runs. `manthan doctor` reports `audit
  chain: ok` across hundreds of events.
- **Evidence**: Live runs against `/tmp/lh-test` (414 events, doctor ok),
  `/tmp/decay-test` (chain ok after 120 events including back-dated
  decay), `/tmp/review-test` (chain ok after batch-review writes), and
  every workspace exercised in this session.
- **Confidence**: HIGH.
- **Known limitations**: Only Linux (WSL) has been operationally
  exercised. Windows and macOS pass `--version` and `doctor` smoke tests
  in CI; no real workflow has been run on either.

### 1.2 Phase 1.7 single-model continuity reduces drift in a controlled microcosm

- **Finding**: Three trusted facts injected into a Claude plan workflow
  visibly altered the output (the model used the facts; drift on related
  briefs was measurably reduced).
- **Evidence**: Phase 1.7 experiment captured in CONTINUITY_THEORY §9.5
  and the recorded plan runs.
- **Confidence**: MEDIUM. Real effect, very small N (3 facts, 2 briefs,
  1 model, 1 project, 1 author).
- **Known limitations**: This is a *demonstration* that the mechanism
  works, not evidence that it scales, that it survives real usage, or
  that the effect persists when the human writing the briefs does not
  also curate the facts. Phase 3 CpT was designed to address the
  scaling question and (see §2) is currently tautological.

### 1.3 The dedup detector catches engineered paraphrase clusters

- **Finding**: `findDuplicateClusters` correctly identifies the 3-way
  session-cookie paraphrase trio and the 2-way response-envelope pair
  engineered into the ALPHA_SERVICE corpus, plus surfaces
  contradiction-shaped pairs for human review.
- **Evidence**: Smoke-tested on the simulator-populated workspace; the
  clusters returned match the corpus engineering exactly.
- **Confidence**: HIGH for the engineered patterns.
- **Known limitations**: The corpus was built by the same author who
  built the detector. There is no evidence on real-world paraphrase
  distributions. Jaccard-on-meaningful-tokens is a coarse signal that
  will produce false positives and false negatives outside the
  engineered patterns.

### 1.4 The hash-chained audit log self-verifies under no-tamper conditions

- **Finding**: `verifyChain()` correctly detects out-of-order events,
  body-hash mismatches, and missing prev-hash links during recovery.
- **Evidence**: Existing tests in `packages/memory/tests/audited-write.test.ts`;
  `manthan doctor` returns `audit chain: ok` after every multi-event run
  exercised this session.
- **Confidence**: HIGH for accidental-corruption detection.
- **Known limitations**: This is integrity *against accidental
  corruption only*. An attacker with local disk access can rewrite the
  log and recompute hashes. The "tamper-evident" framing in
  documentation is overstated (see §2.5).

### 1.5 The hygiene primitives (dedup, decay, shaping, queue-health) execute deterministically

- **Finding**: Each primitive runs to completion, writes audit events,
  produces inspectable output. Re-running with the same seed produces
  byte-identical output.
- **Evidence**: All four primitives exercised in this session; outputs
  reproducible.
- **Confidence**: HIGH for determinism.
- **Known limitations**: Determinism is a property of the mechanism;
  it says nothing about whether the mechanism is the *right* mechanism
  or whether it improves real outcomes. The decay primitive specifically
  has a semantic bug (see §2.3) that means its output is determined off
  the wrong column.

### 1.6 The long-horizon simulator produces internally consistent dynamics

- **Finding**: Under simulated months of pressure, the trusted layer
  reaches a token plateau (~1500 trusted tokens after each cycle),
  while the T0 backlog varies with human review attention. Two runs
  with attention=0.6 and attention=0.15 produced final T0=2 and T0=51
  respectively, identical trusted layers.
- **Evidence**: `/tmp/lh-test` and `/tmp/lh-test-low` workspaces, JSONL
  snapshot files at `.manthan/experiments/`.
- **Confidence**: MEDIUM for the *shape* of the dynamic. LOW for any
  external generalization.
- **Known limitations**: Self-confirming experiment. Same corpus
  recycled 3×; same detectors used for both stress and measurement.
  Codex's review explicitly: *"not an external validity test. It is an
  internal stress harness for its own heuristics."* The "~1500 token
  plateau" is most likely a property of the synthetic corpus, not the
  substrate.

### 1.7 Promotion UX (batch grammar, inline provenance) functions as designed *inside* a session

- **Finding**: `manthan brain review --batch "1-5p 6P 7s"` correctly
  parses, displays a pre-commit summary, applies promotions atomically
  one-per-fact, surfaces undo seqs.
- **Evidence**: Smoke-tested in this session against simulated workspace.
- **Confidence**: HIGH for *what the command does once invoked*.
- **Known limitations**: Zero evidence on whether users actually invoke
  the command at the right cadence. The session is the easy part; the
  initiation hook is the hard part and is not solved.

---

## 2. INVALIDATED — disproven, weakened, or implementation/documentation mismatches

Findings flagged by the /octo:review fleet, code-verified during the
review. These are not future risks; they are current defects.

### 2.1 The multi-model continuity thesis (E6)

- **Status**: REFUTED at the adapter level by E6 (2026-05-16-earlier).
  Claude replicated successfully; Codex CLI parser failed; Gemini CLI
  drowned out the trusted-facts layer with its own framing.
- **What that does and does not mean**:
  - It does NOT refute the thesis that continuity *could* survive
    cross-model handoff with proper adapters.
  - It DOES refute the minimal-adapter approach the project has been
    taking.
  - Without a fix, the README claim ("a continuity layer that sits
    underneath whichever AI you happen to use") is unsupported by
    evidence and contradicted by the most recent experiment.

### 2.2 Phase 3 CpT measurement design is tautological

- **Status**: As designed, the Phase 3 CpT experiment cannot answer the
  question it claims to answer.
- **Evidence**: Three reviewers (Sonnet, Codex, Gemini) independently
  identified this. The ALPHA_SERVICE corpus and the four briefs at
  `docs/phase3_briefs/` were written by the same author; the briefs
  probe exactly the facts the corpus contains. The empty workspace will
  produce different output for tautological reasons (it has no facts
  to draw on) regardless of whether the trusted facts are *useful* on
  real work. The healthy workspace will appear to reuse facts because
  the briefs were written to invite that reuse.
- **Required redesign before any CpT data can support a claim**:
  - Corpus from real usage data the author did not curate.
  - Briefs written by someone who has not seen the corpus.
  - Rubric reviewer blinded to which workspace was "healthy."

### 2.3 The decay engine measures the wrong column

- **Status**: SEMANTIC BUG. Codex finding, code-verified.
- **Mechanism**: `decay.ts` uses `semantic_facts.last_corroborated` as
  the staleness basis (`packages/orchestrator/src/decay.ts:147-151`).
  Every trust mutation (`brain-trust.ts:371-379`) and every dedup
  merge (`dedup.ts:370-378`) overwrites that column with the mutation's
  timestamp. The column is therefore "time since any administrative
  touch," not "time since corroboration."
- **Implication**: Every long-horizon, every queue-health stale-fact
  count, every decay-band classification has been computed off the
  wrong signal. The "~1500 trusted-token plateau" observation in §1.6
  is partly a consequence of this bug, not just of the synthetic
  corpus.
- **Required fix**: Either add a `last_corroborated_by_workflow` column
  that only mutates on actual corroboration events, or change
  `applyTransition` to leave `last_corroborated` alone on
  promotion/demotion/dedup-merge and update only `tier` + `confidence`.

### 2.4 The replay claim does not match implementation

- **Status**: CLOSED in P0.3 (2026-05-18). The historical text is
  preserved below as the record of the gap that was closed.
- **What was implemented**: `replayRun` now mechanically verifies
  (a) the audit chain, (b) each audit event's payload blob hash,
  (c) the `agent.invoke` canonical-response hash (via P0.1's
  `canonical_hash` field), and (d) the bundle hash via
  `recomputeBundleHash` (via P0.3 Commit A's per-layer
  `content_sha256` in `context_snapshots.layers_json`). The CLI
  emits one of four statuses: `verified` / `legacy` /
  `unverifiable` / `corrupted`. Corruption always wins. What replay
  still does not do: re-invoke the model, check upstream source
  state, or verify semantic equivalence. Those are out of scope
  and remain disclaimed in `README.md` and
  `packages/orchestrator/src/replay.ts`.

**Historical record (gap as it stood before the fix):**

- **Mechanism**: `replayRun` reads recorded values from the audit log
  + blob store and returns them (`packages/orchestrator/src/replay.ts:97-138`).
  It does NOT reconstruct the bundle, recompute the bundle hash, or
  compare against the recorded hash. This is inspection, not
  verification.
- **Implication**: POSITIONING.md and README claim "deterministic
  replay verifies past runs." The claim is not supported by the code.
- **Required fix**: Either implement bundle recomputation +
  comparison, or downgrade the documentation to "inspect past runs
  from audit + blobs."

### 2.5 The "tamper-evident audit chain" framing is misleading

- **Status**: OVERSTATEMENT. Gemini finding; corroborated by reading
  `audited-write.ts`.
- **Mechanism**: SHA-256 hash chain of `prev_hash || canonical(body)`.
  This is integrity *against accidental* corruption, not against a
  local-disk attacker who can rewrite the log and recompute hashes
  forward.
- **Required fix**: Documentation either downgrades to "accidental
  corruption detection" or anchors via an external trust root
  (transparency log, external signer) before claiming tamper-evidence
  against an adversary.

### 2.6 The PAL/ESLint enforcement claim is false

- **Status**: FALSE. Codex finding, code-verified.
- **Mechanism**: README §Implementation notes claims "ESLint-enforced
  PAL seam." The repo uses Biome, not ESLint; there is no ESLint
  config; raw `node:fs` and `node:path` imports exist in `apps/cli/src/commands/init.ts`,
  `doctor.ts`, `brain-long-horizon.ts`, `brain-sim.ts`,
  `packages/context/src/packer.ts`, `packages/orchestrator/src/replay.ts`,
  `packages/memory/src/audited-write.ts`, `recovery.ts`.
- **Required fix**: Either add real lint enforcement of the PAL seam
  or strike the sentence from the README.

### 2.7 `brain-trust` audit metadata is internally inconsistent

- **Status**: BUG. Codex finding.
- **Mechanism**: Human-initiated promotions write
  `decision: 'auto-approve'` in the audit event metadata
  (`brain-trust.ts:352-358`). The actor field is human-shaped; the
  decision field is not.
- **Required fix**: Change to `'human-approved'` when the actor is a
  human; reserve `'auto-approve'` for genuine machine-decided
  transitions.

### 2.8 `undoCorrection` is unsafe against intervening corrections

- **Status**: BUG. Codex finding.
- **Mechanism**: `undoCorrection` loads the original correction and
  blindly resets the fact to `original.from_tier`
  (`brain-trust.ts:241-302`), without checking whether later
  corrections already changed the fact. A stale undo can clobber
  newer state.
- **Required fix**: Compare the fact's current tier to the original's
  `to_tier`; refuse the undo if they differ.

### 2.9 The "fact storage in plaintext is fine for MVP" framing

- **Status**: WEAKENED. Gemini finding, code-verified at
  `apps/cli/src/auth-store.ts`.
- **Mechanism**: API keys live in `~/.config/manthan/api-keys.env` or
  `.manthan/secrets.env`. The auth-store comments correctly state "OS
  keychain integration is the recommended path" but mark it deferred
  to Phase 5+.
- **Implication**: Acceptable for private development; not acceptable
  for any public push. The combination of plaintext keys + in-process
  unsandboxed adapters means a single malicious npm dependency in any
  adapter package can read the keys and the brain.
- **Required fix**: Either move to OS keychain on first public release,
  or document the storage model as "research-grade, bring-your-own-key
  policy" at top of README.

### 2.10 "Self-bounding at ~1500 tokens" is conditional, not structural

- **Status**: WEAKENED. The token plateau observed in long-horizon Run
  A and Run B is the equilibrium of *(decay rate, dedup rate, corpus
  recycling pattern)* given the synthetic ALPHA_SERVICE workload, not a
  property of the substrate.
- **Mechanism**: Recycling the same 48-fact corpus 3× generates
  dedup-able pressure that drains directly into archive. A non-recycled,
  monotonically-growing real corpus would not produce the same plateau.
- **Required fix**: Re-run long-horizon against a non-recycled, growing
  corpus before any claim of "structural self-bounding" is made
  publicly.

---

## 3. UNPROVEN — major claims with no empirical backing

Items that have been *designed for* or *gestured at* but have not been
shown to be true.

### 3.1 Continuity economics (CpT)

- **Claim**: "Bounded trusted continuity produces meaningfully better
  engineering outcomes relative to its token cost."
- **State**: The Phase 3 CpT harness was built and dry-run-validated.
  No live LLM matrix has been run. The matrix as currently designed is
  tautological (see §2.2). There is no honest CpT number for ManthanOS
  as of this writing.

### 3.2 Long-term queue sustainability

- **Claim**: "Humans will maintain the trust queue across months of
  real usage."
- **State**: Long-horizon simulator parameterizes human attention as
  an input. Real human attention has not been observed. Sonnet's review
  estimates <20% sustained adoption under realistic conditions; that is
  the median engineering-tools base rate, not a measurement.

### 3.3 Real-world trusted-layer growth dynamics

- **Claim**: "Trusted layer self-bounds at ~1500 tokens." See §2.10.
- **State**: Observed only against a recycled synthetic corpus. The
  honest claim is "self-bounded against the corpus recycling pattern we
  used." Real-codebase growth has not been tested.

### 3.4 Cross-model portability with proper adapters

- **Claim**: "Continuity layer that sits underneath whichever AI you
  happen to use."
- **State**: REFUTED with minimal adapters (E6). Not yet tested with
  properly-built adapters. E6.1 (see §6) would answer this.

### 3.5 Commercial viability

- **Claim**: "There is a buyer for trust-gated continuity lifecycle
  infrastructure."
- **State**: Zero customer interviews. Zero pilot users. Zero pricing
  experiments. POSITIONING.md describes a category understandable to
  the builder; no evidence it is understandable to a buyer.

### 3.6 Moat assumptions

- **Claim**: "Audit-chain replay + provenance + trust-tier semantics
  differentiate against Cursor / Anthropic / Letta."
- **State**: Each is implementable by an incumbent in ≤1 sprint. The
  Opus review's blunt assessment: "If the mechanisms get copied, there
  is no durable moat from the mechanism." No counter-evidence exists.

### 3.7 Adoption assumptions

- **Claim**: "Engineers will adopt a 19-command CLI ritual because
  the substrate is well-designed."
- **State**: Zero usability tests. The promotion UX work is well-built
  for an existing user; it has not been observed in a new user's first
  hour. Sonnet's review names three friction points that will surface
  in the first hour. None have been tested.

### 3.8 Cross-platform parity

- **Claim**: "Equal first-class Win/macOS/Linux."
- **State**: CI runs `--version` and `doctor` on all three. No real
  workflow has been run on Windows or macOS. The substrate code path
  in `audited-write.ts` explicitly admits weaker Windows append
  guarantees. The PAL seam is not enforced (see §2.6). "Equal" is
  aspirational.

### 3.9 The "visible-backlog beats silent-corruption" claim

- **Claim**: Phase 2's framing: "The substrate's primary failure mode
  is visible backlog, not silent poisoning. That's a healthy
  architectural outcome."
- **State**: Engineering intuition, not psychological measurement.
  Gemini's counter: "Users don't experience a 51-fact backlog as
  'visible debt to pay down.' They experience it as a notification to
  dismiss." Both are plausible. Neither has been observed.

---

## 4. THESIS MAP — dependency tree from original pain to current status

```
Original pain
"The human is the manual integration bus between AI tools"
(FUTURE_COMMAND_CENTER §2 describes this exactly)
│
├── Required mechanism A: cross-tool, cross-model continuity layer
│   │
│   ├── Required evidence A1: continuity helps a single model
│   │   └── Status: PARTIALLY VALIDATED (Phase 1.7, small N)
│   │
│   ├── Required evidence A2: continuity survives cross-model handoff
│   │   └── Status: REFUTED with minimal adapters (E6)
│   │       Blocker: no real adapters have been built or tested
│   │
│   └── Required evidence A3: continuity helps a real engineer's real work
│       └── Status: UNPROVEN (Phase 3 designed; design is tautological)
│
├── Required mechanism B: hygiene to keep continuity from becoming pollution
│   │
│   ├── Required evidence B1: hygiene primitives execute deterministically
│   │   └── Status: VALIDATED (mechanically)
│   │
│   ├── Required evidence B2: hygiene measures the right thing
│   │   └── Status: INVALIDATED — decay measures the wrong column (§2.3)
│   │
│   └── Required evidence B3: hygiene controls real-world entropy
│       └── Status: UNPROVEN — synthetic recycled corpus only
│
└── Required mechanism C: humans actually use it
    │
    ├── Required evidence C1: the UX inside a session is low-friction
    │   └── Status: VALIDATED (Sonnet acknowledges this)
    │
    └── Required evidence C2: humans initiate the UX consistently over time
        └── Status: UNPROVEN — no real user has been observed
            Blocker: there is no initiation hook
```

**Summary read of the tree**: Mechanism A is the original product. Its
A2 leg is refuted; its A3 leg is unproven; only A1 is partially
validated. Mechanism B's B1 is the substrate work that absorbed Phase
2 — well-built but B2 has a real bug and B3 is synthetic-only.
Mechanism C's C1 (the part that's been worked on) is real; C2 (the
part that determines actual product survival) has zero evidence.

The project has been working most heavily on the leaves with the
weakest connection to the root. The root pain (the human as
integration bus) has been least directly addressed since E6.

---

## 5. STRATEGIC DRIFT ANALYSIS

Where exactly did drift begin, why did it happen, was it rational, and
did narrowing become avoidance?

### 5.1 Where drift began

- **Inflection point**: 2026-05-15-ish, immediately after E6.
- **What E6 showed**: Cross-model continuity *with the minimal adapter
  approach* does not work. Claude replicated; Codex CLI parser failed
  on JSON extraction; Gemini CLI drowned out the trusted-facts layer
  with its own framing.
- **What that did NOT show**: Whether cross-model continuity works with
  *properly-built* adapters.
- **The response that happened**: Narrow to single-model. Defer
  cross-model indefinitely. Build Phase 2 hygiene.

### 5.2 Why the drift happened

Three causes, in order of weight:

1. **E6 looked like a thesis failure from the inside, not an adapter
   failure.** The framing "the runtime cannot bridge models" is what
   stuck, not "the adapters are too thin." This is a perceptual error
   that the disciplined-evidence culture rewarded — "evidence says
   stop" is celebrated even when the evidence is about a sub-component.

2. **Phase 1.7 worked clearly and cleanly.** Single-model continuity
   produced visible, measurable drift reduction. Phase 2 was the
   natural extension. The path was tractable; the alternative (fixing
   adapters) was unglamorous subprocess plumbing.

3. **The substrate was rewarding.** Decay, dedup, shaping, observability
   — each landed with concrete artifacts, neat audit events, satisfying
   commands. The substrate became its own justification. Long-horizon
   synthetic experiments felt like product validation; they were
   substrate validation.

### 5.3 Was the narrowing rational

- **In isolation**: Yes. "Build on what works, defer what doesn't" is
  good engineering discipline.
- **In strategic context**: No. The product was supposed to solve a
  cross-model integration problem. The narrowing removed the
  cross-model claim while preserving the rhetoric ("continuity layer
  underneath whichever AI you use" stayed in the README, despite E6
  refuting it).
- **Honest framing**: A rational research move that became an
  irrational product move because the product framing was not updated
  to match.

### 5.4 Did narrowing become avoidance after E6

Yes. Specifically:

- The cost of retrying cross-model with proper adapters is small:
  4–6 hours per adapter, ≤2 days total for one secondary model.
- That cost was never paid.
- Instead, ~3 weeks of substrate work was done on Phase 2 deliverables
  3 through 7.
- The deferral is documented as "preserving optionality for E6.1
  WITHOUT expanding scope" (PHASE2_THEORY §6). That phrase is
  rationalization. "Preserving optionality" without actually testing
  it is just deferral.

The narrowing became avoidance the moment the substrate work crossed
the labor budget that would have rebuilt the failed adapters. That
happened approximately at the dedup/decay landing point — roughly
2026-05-16-early in this conversation's chronology.

### 5.5 Did substrate elegance start replacing product validation

Yes, in two specific ways:

1. **"Phase 2 complete" was declared before Phase 3 had run.** A
   mechanism-complete milestone substituted for a value-validated
   milestone. The substrate is mechanically excellent; that is
   different from being valuable.

2. **The long-horizon synthetic experiments were treated as evidence.**
   They are scaffolding. The internal-stress-test result ("substrate
   self-bounds") was reported in this conversation as a strategic
   finding. Codex's review correctly identified it as the simulator
   measuring its own heuristics.

The most honest summary of the drift: **the project optimized for
buildable, internally-coherent mechanism over externally-validated
product**, because the former rewarded the discipline the project
prides itself on (evidence, audit, hygiene) and the latter required
operations the project's disciplinary culture is less equipped for
(user interviews, market exposure, adapter-plumbing labor).

---

## 6. E6.1 DESIGN — minimal cross-model continuity validation

Goal: answer ONE binary question.

> *Can trusted continuity built against Claude materially influence the
> output of a second, different model handed the same project context?*

Pass/fail only. No CpT number, no rubric, no shaping projection. Just:
does the second model demonstrably use the brain's facts in a way the
no-brain baseline does not?

### 6.1 Scope (everything inside this is in; everything else is out)

- One workspace: the existing `/tmp/lh-test` Run A (healthy, 41 trusted
  facts, ~1500 trusted tokens).
- One brief from `docs/phase3_briefs/`: `auth-reset-password.brief`
  (the brain has the most signal here — session cookies, OAuth,
  refresh tokens, single-use token policy).
- Two models: Claude (the model the brain was promoted under) and ONE
  other. Recommended other: **OpenAI gpt-5 or gpt-4o via direct API**
  (NOT Codex CLI — the CLI adapter is the thing E6 already proved
  brittle).
- Three runs:
  - **C-empty**: Claude against empty workspace, brief A.
  - **C-healthy**: Claude against `/tmp/lh-test`, brief A. (Ceiling.)
  - **X-healthy**: Second model against `/tmp/lh-test`, brief A.
    (The actual question.)
  - **X-empty**: Second model against empty workspace, brief A.
    (Baseline.)

### 6.2 What is NOT in scope

- No new orchestration. Each model gets one shot.
- No autonomous agents.
- No frontend.
- No multi-step workflows.
- No new hygiene primitives.
- No brain modifications during the experiment.
- No Codex CLI / Gemini CLI re-attempt. Direct API only.

### 6.3 Adapter work required

- **One** new adapter package: `@manthanos/adapter-openai` (or extend
  the existing `adapter-claude` shape for an OpenAI API target). 
- Surface area: send `system_prompt + user_prompt`, receive structured
  JSON output via tool-use or response_format.
- Implementation cost: ~80 lines, ~3 hours.
- Risk: OpenAI's response_format JSON differs from Claude's tool-use
  shape; the existing `plan-extract.ts` may need a small parser
  branch. Budget another 1–2 hours.

### 6.4 Measurement

> **Footnote (added 2026-05-17 by `docs/POSITIONING_CORRECTION.md`).**
> The scope rule below is a **measurement scope**, not a **product scope**.
> *Measurement scope:* we do not publicly claim cross-model effect on
> output quality until E6.1 produces a number.
> *Product scope:* the substrate already addresses the multi-tool case
> by construction — the brain is provider-agnostic and adapters exist
> for Claude (API+CLI), Codex CLI, Gemini CLI, and OpenAI. The product
> records and presents continuity across whichever tool runs the next
> workflow; it just does not yet assert that doing so improves the
> next tool's output. The README and `docs/POSITIONING.md` were
> over-narrowed during stabilization because this distinction was not
> documented. This footnote is the correction.

Two objective signals plus one binary judgment.

- **Trusted-fact reference count** (already implemented in
  `cpt-probe`): for each trusted fact's statement, count meaningful
  tokens shared with the model output (≥ 4 shared = reference).
- **Token cost**: input + output tokens, per run.
- **Binary judgment** (the only subjective step): for each of the
  four runs, does the output's `/reset-password` design respect the
  project's trusted facts about *session storage* (httpOnly cookies),
  *token lifetime* (single-use), and *existing primitives* (refresh
  tokens)? The brief explicitly asks the model to specify these. A
  human reads the four outputs and answers four yes/nos.

### 6.5 The four outcomes

| C-healthy | X-healthy | What it means |
|---|---|---|
| ✓ uses facts | ✓ uses facts | Continuity transfers across models. Thesis re-broadens. |
| ✓ uses facts | ✗ does not | Continuity is model-specific. The runtime substrate doesn't fix the cross-model gap; richer adapters might (would warrant E6.2). |
| ✗ does not | — | Phase 1.7 failed to reproduce in this brief. Stop and investigate before any cross-model conclusion. |
| ✗ does not | ✗ does not | The brain isn't load-bearing on this brief regardless of model. Investigate brief choice and re-run with brief 2 or 3. |

### 6.6 Budget

- Engineering: ≤2 days end-to-end (adapter + run + writeup).
- LLM cost: 4 calls × ~2K input + ~2K output each = trivial.
- Stopping rule: if the adapter takes more than 2 days to get to "one
  successful call against gpt-5/4o on the empty workspace," STOP and
  document the friction. Don't sink more time.

### 6.7 What this experiment cannot answer

It cannot answer:
- Whether continuity helps real engineers (still requires non-tautological CpT).
- Whether the second-model behavior generalizes to other briefs.
- Whether users will adopt the workflow.

It can only answer the binary cross-model question. That is enough to
trigger the next decision.

---

## 7. PHASE RESET RECOMMENDATION

The four options stated in the prompt, evaluated against the truth-map above:

### A. Continue narrowed single-model thesis

- **Strongest case**: ship a Claude Code plugin that does trust-gated
  memory. Polish the UX. Hope to get adopted before Anthropic ships
  Claude Projects with a decision log.
- **Strongest objection**: this is a feature in a race against the
  vendor that owns the IDE and the model. The race is structurally
  unwinnable on the product the project would actually be selling.
- **Cost**: 6–12 months. Likely outcome: an elegant tool that few use,
  superseded by a vendor feature.
- **Verdict**: not the right move.

### B. Re-open cross-model thesis

- **Strongest case**: the original pain is the only pain the project
  was ever positioned to solve. E6.1 is cheap (≤2 days). If E6.1
  succeeds even partially, the moat story re-broadens and the entire
  substrate becomes load-bearing for a defensible product. If E6.1
  fails again with proper adapters, the narrowing becomes
  evidence-based instead of avoidance.
- **Strongest objection**: it might fail. The runtime might not be
  sufficient to bridge models even with good adapters.
- **Cost**: 2 days for E6.1; 2–4 weeks if it succeeds and warrants
  full re-opening.
- **Verdict**: the cheapest most-informative move available.

### C. Pivot toward compliance/audit substrate

- **Strongest case**: the audit chain is regulated-industry-grade.
  Repositioning as "auditable decision history for AI-assisted
  engineering in regulated industries (financial services, healthcare,
  defense, public sector AI procurement)" uses the substrate's actual
  strength. Regulatory tailwinds (EU AI Act, NIST AI RMF) are
  favorable. Buyers exist and have budgets.
- **Strongest objection**: requires pivot-class work (customer
  interviews, regulatory framing, pilot customers, SOC2-ish posture).
  The founder's skill set as expressed in this codebase is
  substrate-builder, not enterprise-seller. The substrate also has
  three correctness bugs that block enterprise positioning until fixed.
- **Cost**: 3–6 months minimum before any commercial signal. Bigger
  ask than (B) by an order of magnitude.
- **Verdict**: viable, but not as the immediate next move. Worth
  re-evaluating after E6.1 resolves.

### D. Pause project entirely

- **Strongest case**: the truth-checkpoint has surfaced enough that a
  pause to reflect is defensible.
- **Strongest objection**: the substrate is a real asset that decays
  with neglect. A pause without a clear restart trigger is a soft stop.
- **Verdict**: not warranted unless A and B both fail empirically.

### Recommendation: **B — re-open cross-model thesis via E6.1, time-bounded.**

Reasoning:
- B is the cheapest informative move.
- B is the only option that directly addresses §5.4 (the unpaid labor
  cost that drove the avoidance).
- B's outcome is binary and fast; whichever way it resolves, the next
  decision is clearer.
- B does not preclude A or C later; A and C both preclude B by
  letting the cross-model adapter expertise atrophy further.

**Concrete next sequence after this checkpoint**:

1. Fix the three correctness bugs (§2.3 decay column, §2.4 replay
   claim, §2.8 undo safety) and the audit-metadata inconsistency
   (§2.7). Update the README PAL/ESLint claim (§2.6). Budget: ≤1 day.
2. Update POSITIONING.md and README to remove the "underneath whichever
   AI you use" claim until E6.1 settles it. Budget: ≤2 hours.
3. Build the OpenAI adapter and run E6.1 per §6. Budget: ≤2 days.
4. Based on E6.1 outcome, choose between continuing cross-model,
   pivoting to compliance, or returning to the narrowed single-model
   path with the deferred Phase 3 redesigned to be non-tautological.

Do NOT run Phase 3 CpT in its current form. Do NOT continue Phase 2
deliverable #8 (the CpT measurement pass) until either the corpus is
real or the experimental design is repaired.

---

## 8. What this document is not

- Not a roadmap.
- Not a project obituary.
- Not motivation.
- Not protection.

It is a fixed reference point. Future work should be measurable
against the claims in §1, the bugs in §2, the gaps in §3, the
dependencies in §4, and the recommendation in §7. If a future decision
contradicts something in this document, the contradiction itself is
information worth recording.

---

*End of checkpoint. Date: 2026-05-16. Author: DeadlyVirusIn, assisted
by /octo:review fleet (Claude Opus 4.7, Claude Sonnet 4.6, OpenAI
Codex/gpt-5.4, Google Gemini).*

---

## 14. E6.1 outcome and resulting direction

Per `docs/STABILIZATION.md` §6.5, this section records the
stabilization phase's decision-gate outcome.

- **C-empty**: not executed.
- **C-healthy**: not executed.
- **X-empty**: not executed.
- **X-healthy**: not executed.
- **Token costs**: $0 (OpenAI returned `429 insufficient_quota` on the
  first attempted call; mechanical adapter implementation succeeded
  in ~23 minutes).
- **§6.2 row triggered**: none. Matrix is empty.
- **§6.4 anti-extension applied**: yes, by analogy. Indecision is not
  an outcome; the phase closes with the position the existing
  evidence supports.
- **Chosen option (per §6.3 / §6.4 spirit)**: **Option A — continue
  the narrowed single-provider thesis.**
- **Triggering rationale**: E6.1 was the bounded mechanism by which
  the cross-model thesis could have acquired positive evidence. The
  experiment did not execute; the burden of proof on the cross-model
  thesis was not discharged; the existing evidence still supports the
  narrowed single-provider thesis (§1.2 Phase 1.7 result).
- **Decided**: 2026-05-16.
- **Full verdict**: `docs/STABILIZATION_VERDICT.md`.

Stabilization phase closes with this entry.
