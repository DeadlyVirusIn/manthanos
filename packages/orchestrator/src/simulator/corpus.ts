// SPDX-License-Identifier: BSL-1.1
// Copyright (c) 2026 DeadlyVirusIn

// Curated fact corpus for the brain-aging simulator.
//
// This corpus represents a plausible 8-week trajectory for a mid-sized
// TypeScript service ("alpha-service"). It deliberately includes the
// entropy patterns called out in PHASE2_THEORY.md §2:
//
//   - paraphrases (e.g., 3 near-duplicate session-cookie facts)
//   - partial contradictions (Postgres → SQLite mid-project)
//   - stale assumptions (Docker → Vercel migration)
//   - abandoned approaches (Jest considered but rejected;
//     GraphQL endpoint planned but never built)
//   - "forgotten but still trusted" facts (UI area: 6 facts promoted
//     in weeks 1-4, then no activity)
//   - uneven promotion patterns (some facts promoted immediately,
//     some weeks later, some never)
//
// The corpus is intentionally static and curated rather than
// procedurally generated. We are not testing the simulator's
// creativity — we are testing the runtime's behavior under a known
// realistic input. Procedural generation would let the simulator
// "drift" away from realistic patterns silently.

export type CorpusTier = 'T0' | 'T+1' | 'T+2';

export interface CorpusFact {
  readonly area: string;
  readonly statement: string;
  /** Week in the simulated project timeline when this fact emerges (1-indexed). */
  readonly weekIntroduced: number;
  /**
   * Target tier at end of simulation. T0 = stays quarantined,
   * T+1 = promoted at some point, T+2 = promoted then corroborated.
   * The simulator schedules the corresponding correction events.
   */
  readonly targetTier: CorpusTier;
  /**
   * Optional notes — visible in dry-run output. Helps the operator
   * confirm the corpus contains intended patterns.
   */
  readonly notes?: string;
}

export const ALPHA_SERVICE_CORPUS: ReadonlyArray<CorpusFact> = Object.freeze([
  // ------------------------------------------------------------------
  // area=auth — heavy area; OAuth lifecycle evolved over 6+ weeks
  // ------------------------------------------------------------------
  {
    area: 'auth',
    statement: 'Google OAuth is the primary identity provider; client credentials in env vars.',
    weekIntroduced: 1,
    targetTier: 'T+2',
    notes: 'core architectural commitment; corroborated by multiple later plans',
  },
  {
    area: 'auth',
    statement: 'GitHub OAuth is added as a secondary provider in week 3.',
    weekIntroduced: 3,
    targetTier: 'T+1',
  },
  {
    area: 'auth',
    statement: 'OAuth tokens stored in httpOnly cookies.',
    weekIntroduced: 1,
    targetTier: 'T+1',
    notes: 'paraphrase group A — canonical form',
  },
  {
    area: 'auth',
    statement: 'Sessions kept in httpOnly cookies.',
    weekIntroduced: 3,
    targetTier: 'T+1',
    notes: 'paraphrase group A — variant; same meaning, different phrasing',
  },
  {
    area: 'auth',
    statement: 'Sessions are kept in httpOnly cookies (no JS access).',
    weekIntroduced: 5,
    targetTier: 'T+1',
    notes: 'paraphrase group A — third near-duplicate',
  },
  {
    area: 'auth',
    statement: 'Refresh tokens are single-use; each refresh invalidates the prior access token.',
    weekIntroduced: 2,
    targetTier: 'T+1',
  },
  {
    area: 'auth',
    statement: 'Refresh tokens have a 30-day TTL.',
    weekIntroduced: 2,
    targetTier: 'T+1',
  },
  {
    area: 'auth',
    statement: 'Raw random strings are sufficient for tokens (no JWT signing).',
    weekIntroduced: 1,
    targetTier: 'T+1',
    notes: 'partial contradiction — paired with the "switching to JWT" fact in week 6',
  },
  {
    area: 'auth',
    statement: 'Switching to JWT signed tokens (RS256) in v2.',
    weekIntroduced: 6,
    targetTier: 'T+1',
    notes: 'contradicts the "raw random strings" T+1 fact; neither demoted in simulation',
  },
  {
    area: 'auth',
    statement: 'PKCE flow is required for SPA clients.',
    weekIntroduced: 4,
    targetTier: 'T+1',
  },
  {
    area: 'auth',
    statement: 'Session store uses Redis in production, in-memory in dev.',
    weekIntroduced: 5,
    targetTier: 'T+1',
  },
  {
    area: 'auth',
    statement: 'Session store is in-memory locally; Redis for production environments.',
    weekIntroduced: 5,
    targetTier: 'T0',
    notes: 'paraphrase group B — never promoted (quarantined)',
  },

  // ------------------------------------------------------------------
  // area=db — architectural reversal mid-project (Postgres → SQLite)
  // ------------------------------------------------------------------
  {
    area: 'db',
    statement: 'Postgres 15 is the primary database for all environments.',
    weekIntroduced: 1,
    targetTier: 'T+1',
    notes: 'stale: contradicted by week 5 migration; never demoted',
  },
  {
    area: 'db',
    statement: 'SQLite is the database for dev environments.',
    weekIntroduced: 2,
    targetTier: 'T+1',
  },
  {
    area: 'db',
    statement: 'Migrating from Postgres to SQLite for v1 launch; review revisits Postgres for v2.',
    weekIntroduced: 5,
    targetTier: 'T+1',
    notes: 'changes architectural direction; superficially contradicts week-1 Postgres fact',
  },
  {
    area: 'db',
    statement: 'Use better-sqlite3 native bindings for the SQLite driver.',
    weekIntroduced: 6,
    targetTier: 'T+1',
  },
  {
    area: 'db',
    statement: 'Migrations live in src/db/migrations/ with YYYYMMDD_NNNN_description.sql naming.',
    weekIntroduced: 1,
    targetTier: 'T+2',
    notes: 'stable convention; promoted then corroborated',
  },
  {
    area: 'db',
    statement: 'Migrations run automatically on application startup.',
    weekIntroduced: 3,
    targetTier: 'T0',
    notes: 'contradicted by week 6 fact; never promoted',
  },
  {
    area: 'db',
    statement: 'Migrations require manual confirmation before running in production.',
    weekIntroduced: 6,
    targetTier: 'T0',
    notes: 'contradicts the "automatic on startup" fact; both stay T0',
  },
  {
    area: 'db',
    statement: 'Database backups via pg_dump nightly.',
    weekIntroduced: 2,
    targetTier: 'T+1',
    notes: 'stale after week-5 SQLite migration; promotion never reversed (forgotten)',
  },
  {
    area: 'db',
    statement: 'Database file lives at db/alpha-service.db in dev workspaces.',
    weekIntroduced: 5,
    targetTier: 'T0',
  },

  // ------------------------------------------------------------------
  // area=testing — early stable; one stale fact
  // ------------------------------------------------------------------
  {
    area: 'testing',
    statement: 'vitest is the test runner.',
    weekIntroduced: 1,
    targetTier: 'T+2',
    notes: 'corroborated across multiple plans',
  },
  {
    area: 'testing',
    statement: 'Tests live at src/**/*.test.ts colocated with source.',
    weekIntroduced: 1,
    targetTier: 'T+1',
  },
  {
    area: 'testing',
    statement: 'Jest was evaluated and rejected (slower; weaker ESM support).',
    weekIntroduced: 1,
    targetTier: 'T+1',
    notes: 'abandoned-approach fact; preserved as documentation',
  },
  {
    area: 'testing',
    statement: 'Each test resets shared state via beforeEach store.clear().',
    weekIntroduced: 2,
    targetTier: 'T+1',
  },
  {
    area: 'testing',
    statement: 'Integration tests use a real Postgres instance.',
    weekIntroduced: 2,
    targetTier: 'T+1',
    notes: 'stale after week 5 DB migration; not demoted',
  },
  {
    area: 'testing',
    statement: 'Integration tests use a real SQLite instance (in-memory).',
    weekIntroduced: 5,
    targetTier: 'T+1',
  },
  {
    area: 'testing',
    statement: 'Coverage target is 80% for src/, exempted: src/__fixtures__/.',
    weekIntroduced: 1,
    targetTier: 'T+1',
  },

  // ------------------------------------------------------------------
  // area=api — paraphrase pair + abandoned (never-built) approach
  // ------------------------------------------------------------------
  {
    area: 'api',
    statement: 'All HTTP routes mount under /api/v1.',
    weekIntroduced: 1,
    targetTier: 'T+2',
  },
  {
    area: 'api',
    statement: 'REST conventions for CRUD endpoints (no GraphQL).',
    weekIntroduced: 1,
    targetTier: 'T+1',
  },
  {
    area: 'api',
    statement: 'GraphQL endpoint at /api/graphql is planned for v2.',
    weekIntroduced: 4,
    targetTier: 'T0',
    notes: 'abandoned-approach; was discussed, never built',
  },
  {
    area: 'api',
    statement: 'Response envelope: { data, error, meta } JSON.',
    weekIntroduced: 2,
    targetTier: 'T+1',
    notes: 'paraphrase pair with week-4 fact',
  },
  {
    area: 'api',
    statement: 'API responses use { data, error } envelope.',
    weekIntroduced: 4,
    targetTier: 'T0',
    notes: 'paraphrase of the canonical envelope; never promoted',
  },
  {
    area: 'api',
    statement: 'API errors use { code: string, message: string } payload.',
    weekIntroduced: 1,
    targetTier: 'T+1',
  },
  {
    area: 'api',
    statement: 'API versioning via URL path (/api/v1, /api/v2).',
    weekIntroduced: 1,
    targetTier: 'T+1',
    notes: 'directly contradicted by week-6 Accept-Version proposal',
  },
  {
    area: 'api',
    statement: 'API versioning should move to Accept-Version header in v2.',
    weekIntroduced: 6,
    targetTier: 'T0',
    notes: 'contradicts URL-versioning fact; never promoted',
  },

  // ------------------------------------------------------------------
  // area=deploy — Docker → Vercel migration; stale fact retention
  // ------------------------------------------------------------------
  {
    area: 'deploy',
    statement: 'Deployed via Docker on a single Hetzner VPS.',
    weekIntroduced: 1,
    targetTier: 'T+1',
    notes: 'stale after week-6 Vercel migration',
  },
  {
    area: 'deploy',
    statement: 'Migrating to Vercel for v2 production deploys.',
    weekIntroduced: 6,
    targetTier: 'T+1',
    notes: 'contradicts Docker fact above',
  },
  {
    area: 'deploy',
    statement: 'docker-compose.yml for local dev with full service stack.',
    weekIntroduced: 2,
    targetTier: 'T0',
  },
  {
    area: 'deploy',
    statement: 'CI runs on GitHub Actions; deploys only from main branch.',
    weekIntroduced: 1,
    targetTier: 'T+1',
  },
  {
    area: 'deploy',
    statement: 'Production deploys require manual approval in GitHub Environments.',
    weekIntroduced: 1,
    targetTier: 'T+1',
  },
  {
    area: 'deploy',
    statement: 'Staging environment at staging.alpha-service.internal.',
    weekIntroduced: 3,
    targetTier: 'T0',
  },

  // ------------------------------------------------------------------
  // area=ui — "forgotten but still trusted" pattern
  // (heavily-promoted in weeks 1-4, then no activity)
  // ------------------------------------------------------------------
  {
    area: 'ui',
    statement: 'Frontend stack: React 19 + Vite.',
    weekIntroduced: 1,
    targetTier: 'T+1',
    notes: 'untouched after week 4 — the "forgotten" pattern',
  },
  {
    area: 'ui',
    statement: 'Tailwind CSS for all styling (no CSS-in-JS).',
    weekIntroduced: 1,
    targetTier: 'T+1',
  },
  {
    area: 'ui',
    statement: 'Component library: shadcn/ui copied into src/components/ui/.',
    weekIntroduced: 2,
    targetTier: 'T+1',
  },
  {
    area: 'ui',
    statement: 'Dark mode is the default theme; light mode is opt-in.',
    weekIntroduced: 2,
    targetTier: 'T+1',
  },
  {
    area: 'ui',
    statement: 'Forms use react-hook-form + zod for validation.',
    weekIntroduced: 3,
    targetTier: 'T+1',
  },
  {
    area: 'ui',
    statement: 'Charts/visualizations: recharts (Apache 2.0).',
    weekIntroduced: 4,
    targetTier: 'T+1',
  },
]);

/**
 * Summary statistics over the corpus. Used by the simulator's --dry-run
 * mode to show operators what they're about to inject.
 */
export function summarizeCorpus(corpus: ReadonlyArray<CorpusFact> = ALPHA_SERVICE_CORPUS) {
  const byArea = new Map<string, number>();
  const byTier = new Map<string, number>();
  for (const f of corpus) {
    byArea.set(f.area, (byArea.get(f.area) ?? 0) + 1);
    byTier.set(f.targetTier, (byTier.get(f.targetTier) ?? 0) + 1);
  }
  return {
    total: corpus.length,
    byArea: Object.fromEntries(byArea),
    byTier: Object.fromEntries(byTier),
    paraphraseGroups: ['session-httpOnly-cookies (3)', 'response-envelope (2)'],
    contradictionPairs: [
      'raw-random-strings vs JWT-signed (auth)',
      'auto-migrations vs manual-confirmation (db)',
      'URL-versioning vs Accept-Version (api)',
      'Docker-Hetzner vs Vercel (deploy)',
    ],
    abandonedApproaches: ['Jest (testing)', 'GraphQL endpoint (api)'],
    forgottenArea: 'ui (6 facts; no activity after week 4)',
  };
}
