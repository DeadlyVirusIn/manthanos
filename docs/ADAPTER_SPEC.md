# ManthanOS — Adapter Specification

> The contract any agent provider must implement to participate in
> ManthanOS workflows. Status: design lock — pre-implementation.

---

## 1. Purpose

The adapter is the **only seam** between the ManthanOS orchestrator
and an external reasoning system. It is the single most important
interface in the runtime.

Getting this right means:

- Any provider — current or future — can be added without core changes.
- The debate engine, routing engine, and context packer remain
  provider-agnostic.
- Replacing a model is a configuration change, not a code change.
- Plugin contributors have a stable, narrow target.

Getting it wrong means: vendor lock-in, special-case code paths,
fragile workflows, broken cross-provider debates. We are deliberate
about which abstractions belong in the contract and which do not.

---

## 2. Design principles

1. **Uniform.** Every adapter satisfies the same interface. No
   capability is unique to one provider in the contract; capabilities
   are advertised via metadata.
2. **Honest metadata.** Adapters declare what they can do
   (context size, tool use, vision). The runtime trusts the
   declaration but verifies critical claims via contract tests.
3. **Pure async functions of input.** No global state. No persistent
   resources between calls (connections may be pooled internally but
   are not part of the contract).
4. **Cancellable.** Every call accepts an `AbortSignal`. A
   cancelled call must release its resources promptly.
5. **Cross-platform.** Adapters must not rely on POSIX-only behavior.
   Where they shell out (rare), they use the PAL.
6. **Auditable.** Each call returns the raw provider payload, hashed,
   so the audit log preserves what the runtime actually saw.
7. **Cost-accounted.** Every response includes `usage` with input
   tokens, output tokens, and dollar cost (computed locally from
   declared per-model rates).

---

## 3. Type definitions (TypeScript)

These types live in `packages/adapters-sdk`. They are the public
plugin API. Backwards-incompatible changes require a major version
bump of the SDK.

```ts
// ---- Capabilities -------------------------------------------------

export interface AgentCapabilities {
  /** Max input + output tokens supported in a single call. */
  contextTokens: number;
  /** Max output tokens the model will produce. */
  maxOutputTokens: number;
  /** Supports tool / function calling per §6. */
  toolUse: boolean;
  /** Accepts images in input. */
  vision: boolean;
  /** Supports server-side or SDK-side streaming output. */
  streaming: boolean;
  /**
   * What the adapter is allowed to do with the local filesystem.
   * Adapters never read disk directly — this is informational for
   * routing (e.g., a "repo-aware" coding agent declares 'read').
   */
  fileAccess: 'none' | 'read' | 'read-write-sandboxed';
  /** Self-declared strengths, calibrated by the eval harness. */
  reasoningStrength: 1 | 2 | 3 | 4 | 5;
  implementationStrength: 1 | 2 | 3 | 4 | 5;
  /** Has web browsing built in. */
  webBrowsing: boolean;
  /** Caller can request JSON output via schema. */
  structuredOutput: boolean;
}

// ---- Metadata -----------------------------------------------------

export interface AgentMetadata {
  /** Stable unique ID, e.g. "anthropic:claude-opus-4-7". */
  id: string;
  /** Display name for UIs and logs. */
  displayName: string;
  /** Provider slug, e.g. "anthropic", "openai", "google", "local". */
  provider: string;
  /** Family / model name, e.g. "claude-opus-4-7". */
  model: string;
  capabilities: AgentCapabilities;
  /** Per-1k-tokens cost in USD. */
  cost: { input: number; output: number };
  latencyClass: 'fast' | 'medium' | 'slow';
  /** Soft hints used by the routing engine. */
  recommendedFor: TaskKind[];
  /** Adapter package version (semver). */
  adapterVersion: string;
}

export type TaskKind =
  | 'architecture' | 'implementation' | 'review' | 'ui-critique'
  | 'forensic-debug' | 'security-review' | 'web-research'
  | 'summarization' | 'arbitration' | 'large-context-analysis';

// ---- Messages -----------------------------------------------------

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface TextPart { type: 'text'; text: string; }
export interface ImagePart {
  type: 'image';
  mediaType: string;
  /** Either a data URL or a file path the adapter must encode. */
  source: { kind: 'data'; data: string } | { kind: 'path'; path: string };
}
export interface ToolCallPart {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: unknown;
}
export interface ToolResultPart {
  type: 'tool_result';
  toolCallId: string;
  content: string | unknown;
  isError?: boolean;
}

export type ContentPart = TextPart | ImagePart | ToolCallPart | ToolResultPart;

export interface Message {
  role: MessageRole;
  content: ContentPart[];
}

// ---- Tools --------------------------------------------------------

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema (draft 2020-12 subset). */
  inputSchema: Record<string, unknown>;
}

// ---- Request / Response -------------------------------------------

export interface AgentRequest {
  system?: string;
  messages: Message[];
  tools?: ToolSpec[];
  maxOutputTokens?: number;
  temperature?: number;
  /** Optional JSON schema for structured output. */
  outputSchema?: Record<string, unknown>;
  /** Budget guardrails enforced by the orchestrator, not the adapter. */
  budget?: { maxTokens: number; maxUsd: number };
  abortSignal?: AbortSignal;
  /** Stable workflow ID for adapter-side correlation. */
  correlationId?: string;
}

export interface AgentResponse {
  /** The concatenated text content (convenience). */
  text: string;
  /** Full content array; tool calls live here. */
  content: ContentPart[];
  toolCalls: ToolCallPart[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Computed locally from cost-per-1k. */
    usd: number;
  };
  finishReason:
    | 'stop'           // model ended naturally
    | 'tool_use'       // model wants to call a tool
    | 'length'         // hit maxOutputTokens
    | 'content_filter' // provider refused
    | 'error'          // adapter-level error
    | 'aborted';       // cancelled by AbortSignal
  /** Provider-native payload, retained verbatim for audit. */
  raw: unknown;
  /**
   * Canonical projection of the provider payload used for audit
   * hashing. SDK-version-independent. See §3.1.
   */
  canonical: CanonicalAgentPayload;
  /** Latency in milliseconds (network + provider compute). */
  latencyMs: number;
}

// ---- The Adapter Interface ----------------------------------------

export interface AgentAdapter {
  readonly metadata: AgentMetadata;

  /** One-shot invocation. Required. */
  invoke(req: AgentRequest): Promise<AgentResponse>;

  /** Optional streaming. If unsupported, capabilities.streaming = false. */
  stream?(req: AgentRequest): AsyncIterable<AgentStreamEvent>;

  /** Optional embeddings (unused in MVP but reserved). */
  embed?(input: string[]): Promise<number[][]>;

  /** Optional health probe — used by `manthan doctor`. */
  healthCheck?(): Promise<HealthStatus>;
}

export type AgentStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call_start'; id: string; name: string }
  | { type: 'tool_call_delta'; id: string; arguments: unknown }
  | { type: 'tool_call_end'; id: string }
  | { type: 'usage'; usage: AgentResponse['usage'] }
  | { type: 'finish'; finishReason: AgentResponse['finishReason'] };

export interface HealthStatus {
  ok: boolean;
  message?: string;
  latencyMs?: number;
}
```

### 3.1 AdapterPayloadHasher (canonical projection for audit)

The `raw` provider payload is preserved verbatim for forensic
inspection, but it must **not** be the basis of the audit hash.
Provider SDKs change their response shape between minor versions:
field reordering, added transient metadata (request IDs, server
timestamps), version-specific helper fields. Hashing the raw
payload would churn audit hashes for non-product reasons and break
replay byte-identity across SDK upgrades.

Every adapter response includes a `canonical: CanonicalAgentPayload`
shape — a deterministic projection of the provider's data into a
stable schema controlled by ManthanOS.

```ts
export interface CanonicalAgentPayload {
  /** Always 1 for the initial schema. Bumped on breaking changes. */
  schema_version: 1;

  /** Model identity for replay. Provider-native ID string. */
  model: string;

  /** The structured content the model produced. Order-preserved. */
  content: ContentPart[];

  /** Concatenated text view, for convenience hashing. Optional. */
  text: string;

  /** Tool calls, in declared order. */
  tool_calls: ToolCallPart[];

  /** Usage in integer units only — no floats. */
  usage: {
    input_tokens: number;     // integer
    output_tokens: number;    // integer
    usd_micro: number;        // integer micro-USD (per ARCH §10.1)
  };

  /** Finish reason; uses the canonical enum from §3. */
  finish_reason: AgentResponse['finishReason'];

  /**
   * Provider-side identifiers that are stable and replay-relevant.
   * Excludes timestamps, server-side request IDs, retry counts.
   */
  identifiers: {
    /** Stable model deployment ID where applicable. */
    deployment?: string;
    /** Schema fingerprint when the provider exposes one. */
    response_format_hash?: string;
  };
}
```

**`AdapterPayloadHasher` rules:**

1. Each adapter implements a `toCanonical(raw): CanonicalAgentPayload`
   mapper, kept versioned alongside the adapter.
2. The audit `payload_hash` is `sha256(JsonCanon(canonical))`, never
   `sha256(JsonCanon(raw))`.
3. The audit blob stores **both** the canonical projection and the
   raw payload (as `{ canonical, raw }`). The hash references the
   blob content; both halves are recoverable.
4. The adapter's `toCanonical` function is **purely functional** of
   its inputs (no clocks, no random IDs). Lint-enforced via a
   per-package rule.

**What this guarantees:**

- An SDK minor-version bump that adds a new field to `raw` does
  **not** change `payload_hash`. Audit chain integrity is preserved.
- Replay (`--re-invoke` ... `--strict`) can compare canonical
  projections directly and report exactly which fields drifted.
- Cross-adapter analytics (e.g., "average tokens per workflow type")
  can use canonical fields uniformly.

**What this does not guarantee:**

- If a provider materially changes its model behavior (a new
  reasoning step, a different tool-call protocol), the canonical
  projection may need an extension. Schema_version bumps handle
  this; old canonicals remain valid for old audit chains.
- Adapter authors must keep `toCanonical` complete. A
  contract test (§13) verifies that every reachable response field
  is either mapped into canonical or explicitly elided in the
  `_ignored_fields` test fixture.

---

## 4. Plugin packaging

An adapter is an npm package with the following shape:

```
manthan-adapter-anthropic/
├── package.json
├── manifest.json          # plugin manifest (see §5)
├── dist/
│   └── index.js           # default export: AdapterFactory
├── src/
└── README.md
```

`package.json`:

```json
{
  "name": "manthan-adapter-anthropic",
  "version": "0.1.0",
  "engines": { "node": ">=20" },
  "main": "dist/index.js",
  "type": "module",
  "manthanos": { "adapter": true }
}
```

The default export is a factory:

```ts
export default function createAdapter(
  ctx: AdapterContext
): AgentAdapter | AgentAdapter[];
```

The factory may return multiple adapters (e.g., one package shipping
Claude Opus + Haiku + Sonnet, each with distinct metadata).

`AdapterContext`:

```ts
export interface AdapterContext {
  config: Record<string, unknown>; // resolved from .manthan/config.yaml
  secrets: SecretAccess;           // typed accessor; never bare env vars
  platform: Platform;              // PAL — see PLATFORM_LAYER.md
  logger: Logger;                  // structured (pino-like)
}

export interface SecretAccess {
  /** Returns null if missing. Never throws. */
  get(name: string): string | null;
  /** Records that a secret was accessed (for audit). */
  require(name: string, scope: string): string;
}
```

**Why a factory:** lets adapters validate config + resolve secrets
at registration, fail fast with a useful error, and surface multiple
sibling models from one package.

---

## 5. Plugin manifest

Every adapter ships a `manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "manthan-adapter-anthropic",
  "displayName": "Anthropic (Claude family)",
  "sdkRange": "^0.1.0",
  "configSchema": "./schemas/config.json",
  "secrets": [
    { "name": "ANTHROPIC_API_KEY", "required": true, "description": "..." }
  ],
  "capabilities": {
    "providesAdapters": ["anthropic:claude-opus-4-7", "anthropic:claude-haiku-4-5"]
  },
  "requiresBinaries": [],
  "platforms": ["linux", "macos", "windows"],
  "license": "BSL-1.1 OR Apache-2.0 (post-change-date)"
}
```

The plugin loader validates:

- `schemaVersion` matches.
- `sdkRange` is compatible with the installed SDK.
- `platforms` includes the current OS.
- `requiresBinaries` are present on PATH (via `platform.process.which`).
- All `required: true` secrets resolve.

Failures register the plugin as **unhealthy** but do not crash the
runtime. `manthan doctor` lists unhealthy plugins and reasons.

---

## 6. Tool use protocol

Tools (function calls) are first-class in the contract. Adapters
must translate provider-native tool formats to/from the ManthanOS
canonical form defined in §3.

**Canonical flow:**

1. Orchestrator sends `AgentRequest` with `tools` and `messages`.
2. Adapter returns `AgentResponse` with `finishReason: 'tool_use'`
   and one or more `ToolCallPart`s in `content`.
3. Orchestrator executes the tool (the safety gate decides) and
   appends a `ToolResultPart` message to the conversation.
4. Adapter is re-invoked with the extended `messages` array.

Adapters **never execute tools themselves**. Tool execution is an
orchestrator concern, gated by §SAFETY_MODEL. This rule is what
keeps adapters trustless plugins.

---

## 7. Streaming

Streaming is optional. When supported, `stream()` yields events
defined in §3. The orchestrator may aggregate stream events into a
final `AgentResponse`-shaped object for storage; partial state may
be retained on cancellation.

**MVP:** the CLI does not require streaming. It is plumbed through
the SDK so adapters can declare it and future hosts (editor plugin,
daemon) can use it.

---

## 8. Error model

Errors fall into stable categories. Adapters map provider errors to:

```ts
export type AdapterErrorCode =
  | 'auth'             // missing/invalid credentials
  | 'rate_limited'     // 429 or equivalent
  | 'overloaded'       // provider 5xx capacity
  | 'invalid_request'  // 4xx with our payload at fault
  | 'context_window'   // input too large for model
  | 'content_filter'   // provider refused
  | 'network'          // transient connectivity
  | 'cancelled'        // AbortSignal fired
  | 'internal';        // unclassified

export class AdapterError extends Error {
  code: AdapterErrorCode;
  retriable: boolean;
  retryAfterMs?: number;
  cause?: unknown;
}
```

**Retry policy is the adapter's responsibility for transient errors**
(`rate_limited`, `overloaded`, `network`). The orchestrator does not
retry; it only observes outcomes and budgets.

Rationale: provider rate-limit semantics are provider-specific. The
adapter is the only layer that knows how to back off correctly for
its provider.

---

## 9. Cost accounting

Every response includes `usage.usd`, computed by the SDK helper from
`AgentMetadata.cost` and reported token counts. The adapter does not
hardcode prices; it declares them in metadata.

`computeUsd(usage, cost)` is a single SDK function. The orchestrator
sums these across a workflow and enforces budgets via the safety gate
(workflow halts at budget boundary).

When a provider charges by call (rather than tokens) or by image,
the cost model in metadata supports a per-call surcharge and per-image
surcharge:

```ts
cost: {
  input: number;   // USD per 1k input tokens
  output: number;  // USD per 1k output tokens
  perCall?: number;
  perImage?: number;
}
```

---

## 10. Capability negotiation

Routing engine uses capabilities for scoring. Critical guarantees:

- If `tools` are present in the request and `capabilities.toolUse`
  is false, the orchestrator must not invoke that adapter (the
  routing engine filters it out).
- If a request exceeds `capabilities.contextTokens` after packing,
  the context packer reduces or fails — the adapter never silently
  truncates.
- If `outputSchema` is present and `capabilities.structuredOutput`
  is false, the adapter parses freeform output via the SDK's
  schema-coercion helper. (Not as good as native, but a safety net.)

These guarantees mean workflows are portable across adapters: if a
workflow is feasible at all, the routing engine finds an adapter
that can run it.

---

## 11. Cross-platform requirements

Adapters must:

- Be **pure JavaScript** or ship prebuilt binaries for all three OS
  targets. If native, the plugin loader rejects the adapter on
  platforms where prebuilts are missing.
- Not call `child_process`, `fs.watch`, or shell strings directly.
  Anything OS-touching uses `ctx.platform` (PAL).
- Not assume POSIX paths; use `ctx.platform.path.join`.
- Not read env vars directly for secrets; use `ctx.secrets`.

CI for adapter packages runs on all three OSes via the same matrix
the core uses.

---

## 12. Stability & versioning

The SDK follows semver. Breaking changes to `AgentAdapter`,
`AgentRequest`, `AgentResponse`, or the factory contract are major
bumps and require:

- A migration note in `CHANGELOG.md`.
- A deprecation period of one minor version where the previous shape
  is still accepted.
- Automated compat tests against a published reference adapter.

Manifest field `sdkRange` lets adapters declare compatibility ranges.
The loader refuses adapters with incompatible ranges.

---

## 13. Required contract tests

Every adapter package ships a test file `tests/contract.test.ts`
that runs against the published `@manthanos/adapter-contract-tests`
suite. The suite verifies:

1. **Round-trip** — text in, text out, no message loss.
2. **Tool use** — request with one tool, model responds with a
   tool call, adapter re-invocation with the result yields a final
   text response.
3. **Schema validity** — every `AgentResponse` validates against the
   Zod schema.
4. **Cancellation** — an `AbortSignal` aborts a running call and the
   adapter returns `finishReason: 'aborted'` within 500ms.
5. **Budget guardrail** — over-budget request rejected before network
   call.
6. **Error mapping** — at least one synthetic error per
   `AdapterErrorCode` maps correctly.
7. **Capability honesty** — declared capabilities match observed
   behavior on a small calibration suite.

These tests run with recorded provider fixtures (no live API in CI)
unless the contributor sets `MANTHAN_ADAPTER_LIVE=1`.

---

## 14. Reference implementation

`packages/adapter-claude` is the canonical reference. New adapters
should match its structure and naming. It is the first adapter
shipped, and it is explicitly a plugin (the orchestrator has no
special case for Claude).

---

## 15. What the contract deliberately does not include

- A universal **tool-use API**. We define a canonical shape;
  adapters translate. Trying to enforce a single underlying protocol
  across vendors creates lowest-common-denominator drift.
- **Fine-tuning**, **batch APIs**, **prompt caching specifics**.
  Adapters may expose these via `ctx.config`, but they are not
  contract surface.
- **Provider-side memory** (Anthropic's "memory tool", OpenAI's
  thread state). The runtime owns memory. Adapter-side memory is
  prohibited in MVP and only allowed via an explicit capability flag
  in future versions.
- **Web search built into a provider**. The capability flag is
  surfaced; the workflow decides whether to lean on it.

These exclusions are deliberate — they keep the contract small and
the runtime in control of the system's behavior.

---

## 16. Open questions

- Whether `embed` should be promoted into the required interface
  once vector memory ships. Likely yes.
- Whether to support **multi-modal output** (e.g., generated images).
  Deferred until a real workflow needs it.
- Whether to expose **prompt caching** as a first-class capability,
  given provider-specific behavior. Likely behind a feature flag.
