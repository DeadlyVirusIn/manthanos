# ManthanOS — Observability

> How users (and the runtime itself) see what is happening, debug
> failures, and understand cost.
> Status: design lock — pre-implementation.

---

## 1. Purpose

A runtime that owns memory, runs debates, calls multiple providers,
and gates effectful actions is — by definition — a system. Systems
that are not observable are systems that decay.

Observability in ManthanOS is **first-class**, not bolted on. It
serves three audiences:

- **The user**, who needs to understand cost, what an agent did,
  why a workflow failed, and whether they should trust an outcome.
- **The runtime itself**, which uses telemetry to calibrate routing,
  detect anomalies, and inform the eval harness.
- **Future contributors**, who need to debug workflows, adapters,
  and protocols without reading source code.

The observability surface is the **same artifacts the runtime
already produces** — audit log, brain tables, transcripts —
presented through purpose-built views. We do not build a separate
telemetry system.

---

## 2. Non-goals

- **No external telemetry / phone-home** in MVP. Everything is
  local to the workspace.
- **No web dashboard** until Phase 4+. Terminal is the primary surface.
- **No real-time streaming UI** in MVP. Each command renders its
  view and exits.
- **No metrics backend integration** (Prometheus, Grafana) in MVP.
  These become plugins later if useful.

---

## 3. The four primary surfaces

### 3.1 Token / cost ledger — `manthan costs`

The single most important user-facing observability surface. Shows
where money goes and where it has gone.

```
$ manthan costs --since=today

ManthanOS costs — 2026-05-15 (workspace: ./acme-api)

By workflow:
  plan       (4 runs)   $0.31   124k tokens   8m22s wall
  debate     (2 runs)   $0.78    98k tokens   5m41s wall
  review     (3 runs)   $0.12    44k tokens   2m18s wall
                       ─────   ────────────   ───────
  total       9 runs    $1.21   266k tokens  16m21s wall

By provider:
  anthropic:claude-opus-4-7    $0.94   164k tokens
  openai:gpt-5-mini            $0.18    78k tokens
  google:gemini-2.5-flash      $0.09    24k tokens

Recent budget events:
  2026-05-15 14:22  debate "auth-rewrite" — within budget ($0.40 / $0.50)
  2026-05-15 11:09  plan  "rate-limit"     — within budget ($0.04 / $0.10)
```

Flags: `--since=<range>`, `--workflow=<id>`, `--provider=<id>`,
`--format=json|table|csv`.

Reads directly from `audit_events` + `workflow_runs`. No new
collection layer.

### 3.2 Workflow traces — `manthan trace <runId>`

Shows the step-by-step execution of a workflow run. The graph view
in text form:

```
$ manthan trace 01HF...XK

Workflow: plan v1.0.0
Run:      01HF8C9ABCDEF...XK
Started:  2026-05-15 14:22:01
Status:   completed (38s, $0.04, 27k tokens)

  pack         (context.pack)        0.2s   bundle=sha256:9a...
  ↳ route      (routing.select)      0.0s   adapter=anthropic:claude-opus
  ↳ invoke     (agent.invoke)        37.1s  in=24k out=3k usd=$0.04
    └ tool_call: read_file(src/api/auth.ts)   0.3s
    └ tool_call: read_file(src/api/users.ts)  0.3s
  ↳ persist    (brain.write)         0.1s   task_id=01HF...AB

Audit events: 7 (seq 12491 → 12497)
Brain writes: 1 (task created)
```

Flags: `--diff` (show what brain state changed), `--audit` (link to
audit events), `--inputs` / `--outputs` (show step IO).

### 3.3 Debate browser — `manthan debates`

Lists, filters, and inspects debates as structured artifacts.

```
$ manthan debates --recent=10

ID                    Protocol              Outcome      Cost    Disagree
01HF8...XK   architecture.v1      proceed      $0.42   1 minor
01HF8...AB   review.v1            revise       $0.21   3 (2 mid)
01HF7...QM   forensic-debug.v1    human-decide $0.18   1 critical
...

$ manthan debate show 01HF8...XK

Protocol: architecture.v1 (5 rounds)
Cost: $0.42 (within $0.50 budget)
Outcome: proceed (confidence 0.82)

Consensus:
  - Add OAuth via NextAuth, not custom JWT
  - Sessions must use httpOnly cookies
  - Refresh tokens stored server-side

Disagreements (1 minor):
  - "session timeout duration" — architect says 24h, critic says 8h.
    Arbiter rationale: "context window for the working day is 8h; 24h
    risks token replay during off-hours. Recommend 8h."

Risks: 2 (none critical)
Follow-ups: 3 (1 blocking: write integration test for session expiry)
Participants: claude-opus, gpt-5-mini, gemini-2.5-pro
Transcript: .manthan/debates/01HF8...XK.jsonl

$ manthan debate replay 01HF8...XK
  (re-runs the same workflow against the brain snapshot, no provider
  call; shows the same outcome)
```

### 3.4 Audit explorer — `manthan audit`

Subcommands:

- `manthan audit tail [-f]` — last N events, optional follow.
- `manthan audit grep <pattern>` — search events.
- `manthan audit verify` — re-checks the hash chain. If broken, prints
  the seq where divergence happens.
- `manthan audit show <seq>` — full event detail, including the
  content of the referenced blob (with secret-redaction applied).
- `manthan audit export --since=<range> --format=jsonl` — export
  for external review.

The audit log is **append-only** and **content-addressed**. The
explorer only reads.

---

## 4. Routing telemetry — `manthan routing`

The routing engine is calibrated. Visibility into how it's deciding
is essential for trust.

```
$ manthan routing decisions --since=week

Recent decisions:
  task=plan(architecture)   chose=claude-opus    reason=reasoningStrength>=4, contextTokens>=100k
  task=plan(implement)      chose=gpt-5-mini     reason=cost-floor, implementationStrength>=3
  task=review               chose=claude-haiku   reason=cost-floor, fast
  ...

$ manthan routing calibration

Calibration data: 47 runs, hold-out 8 runs
Routing accuracy vs human-expert choice: 0.79 (vs target 0.75)
Top miscalibrations:
  forensic-debug:    chose=gpt-5-mini, expert=claude-opus  (3 cases)
  review:high-stakes chose=haiku,     expert=gpt-5         (2 cases)
```

The routing engine writes calibration entries automatically. The
user can mark a routing decision as "good" or "bad" with
`manthan routing rate <runId> good|bad`. Ratings become priors.

---

## 5. Provider health — `manthan providers`

```
$ manthan providers

Configured providers:
  anthropic:claude-opus-4-7    healthy   p50=2.1s  p95=4.8s  err=0.4%
  openai:gpt-5-mini            healthy   p50=1.4s  p95=3.2s  err=0.1%
  google:gemini-2.5-pro        DEGRADED  p50=3.8s  p95=18.2s err=4.1%
  local:ollama/qwen-32b        healthy   p50=8.4s  p95=14.1s err=0.0%

Recent errors (last 24h):
  google:gemini-2.5-pro  rate_limited  ×3
  google:gemini-2.5-pro  overloaded    ×8
  openai:gpt-5-mini      network       ×1

Last health check: 2 minutes ago.
```

Health is derived from adapter `healthCheck()` calls and recent
real-call outcomes. Degraded providers are de-prioritized by the
routing engine until they recover.

---

## 6. Replay visibility — `manthan replay`

`manthan replay <runId>` is the workflow-replay entry point. Beyond
just re-running, it provides visibility into **what's deterministic
and what's not**:

```
$ manthan replay 01HF8...XK --diff

Replaying plan run 01HF8...XK
  Brain snapshot: 2026-05-12 14:22 (3 days ago)
  Adapters at recording: claude-opus-4-7

Replay mode: no-network (default)

Step diff vs recorded:
  pack         identical (same bundle hash)
  route        identical (same selection)
  invoke       identical (recorded response replayed)
  persist      identical

No drift. Replay reproduces the original outcome exactly.

(use --re-invoke to re-call providers with the same packed context)
```

If replay drifts (e.g., the workflow definition changed between
recording and replay), the differences are itemized in the output.

---

## 7. Brain inspection — `manthan brain`

Visibility into the cognitive state:

- `manthan brain stats` — counts per memory type, growth rate.
- `manthan brain decisions [--area=X]` — list of signed decisions.
- `manthan brain open-issues` — unresolved tensions.
- `manthan brain facts [--area=X]` — semantic facts with provenance.
- `manthan brain history` — workflow run history.
- `manthan brain export --format=json` — export a snapshot.

```
$ manthan brain stats

Workspace: ./acme-api
Brain age: 27 days
Workflows run: 89
Decisions signed: 12
Semantic facts: 47 (32 charter, 15 derived)
Open issues: 3
Total audit events: 1,247
Brain DB size: 18.4 MB

Compounding indicators:
  Workflows referencing prior decisions: 34% (target >20%)
  Average context bundle "memory recall" %: 14%
  Routing calibration accuracy: 0.79
```

---

## 8. Anomaly detection (cost + behavior)

Built into the runtime, surfaced through observability:

- **Cost spike detection.** A workflow run > 3σ above the 30-day mean
  for that workflow type triggers an `anomaly:cost` event in the
  audit log and renders a warning. `manthan costs --anomalies` lists
  them.
- **Latency spike detection.** Similar, for wall-clock and per-step
  latencies.
- **Failure pattern detection.** When the same adapter has > 3
  errors of the same code in 1 hour, an `anomaly:adapter` event
  fires.
- **Brain growth anomalies.** Brain DB growing faster than the
  expected slope (e.g., due to runaway semantic_fact insertion)
  fires an `anomaly:brain` event.

Anomalies are warnings, not blocks. They surface in `manthan doctor`
and the next command's preamble.

---

## 9. Diagnostics — `manthan doctor`

A read-only health check:

```
$ manthan doctor

ManthanOS doctor — 2026-05-15 14:35

System:
  ✓ Node 20.18.0
  ✓ git 2.48.1
  ✓ Platform: linux (PAL ok)

Workspace:
  ✓ .manthan/ initialized
  ✓ audit chain valid (1247 events, no divergence)
  ✓ SQLite WAL mode active
  ! audit.log is 47 MB (rotation threshold: 50 MB)

Providers:
  ✓ anthropic:claude-opus-4-7 (healthy)
  ✓ openai:gpt-5-mini (healthy)
  ! google:gemini-2.5-pro (degraded — 4.1% error rate today)

Plugins:
  ✓ adapter-claude 0.4.0
  ✓ adapter-openai 0.4.0
  ✓ adapter-gemini 0.4.0
  i No third-party plugins installed.

Recommendations:
  - audit log nearing rotation threshold; will rotate on next event.
  - gemini-2.5-pro degraded — routing engine de-prioritizing.
```

Doctor is the catch-all observability command. It is the first thing
to run when something feels off.

---

## 10. CLI surface summary

| Command | Reads | Purpose |
|---|---|---|
| `manthan costs` | audit, runs | Money / tokens / wall-clock |
| `manthan trace <id>` | runs, audit | Workflow step-by-step |
| `manthan debates` / `debate show <id>` | debates table | Debate inspection |
| `manthan debate replay <id>` | debates, brain snapshot | Replay debate |
| `manthan audit tail/grep/verify/show/export` | audit | Audit explorer |
| `manthan routing decisions/calibration/rate` | routing log | Routing visibility |
| `manthan providers` | health pings, audit | Provider health |
| `manthan replay <id> [--diff/--re-invoke]` | runs, audit | Workflow replay |
| `manthan brain stats/decisions/open-issues/facts/history` | brain | Brain inspection |
| `manthan doctor` | everything | Catch-all health |
| `manthan plugin list` | manifest | Plugin trust state |

All commands are **read-only**. None of them mutate state; they
read from the brain, audit log, and SQLite tables that workflows
already populate.

---

## 11. Implementation notes

- **Performance budget.** Each observability command must render in
  < 1 second on a 1-year-old workspace (100k audit events, 1k
  workflow runs, 100 debates). This is a Phase 1 acceptance criterion.
- **Query patterns.** Every observability command corresponds to one
  or two indexed SQLite queries. No table scans. Indexes are
  defined per ARCHITECTURE.md §9.
- **Output formats.** Every command supports `--format=table` (default,
  human), `--format=json` (machine), `--format=csv` (spreadsheets).
- **Pager.** Long outputs auto-paginate via `less` if a TTY is
  detected; pipe-safe otherwise.

---

## 12. Open questions

- Whether `manthan watch` (live observability stream) belongs in
  MVP. Tentative no — adds daemon complexity for a marginal benefit.
- Whether to expose a structured-log mode for `manthan trace`
  consumable by external tracing tools (OTel). Tentative yes in
  Phase 4 if real users ask.
- Whether brain-export should support a "share with reviewer" mode
  that redacts secret-pattern matches before exporting. Tentative
  yes — useful for sending a brain snapshot to a teammate or to a
  ManthanOS maintainer for a bug report.
