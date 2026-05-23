# @manthanos/web

ManthanOS novice-facing web UI. React + Vite + TypeScript. Consumes
`@manthanos/api` over HTTP, dev-mode via a Vite proxy at `/api`.

## Status

Sprint 2 M1 — foundation milestone in progress. App shell wires
TanStack Query and React Router; real pages start landing in M2.

| Commit | What |
|---|---|
| C1.6 | Stack reconciliation, providers wired, Vite proxy, smoke test |
| C1.7 | Typed API client + branded enum types |
| C1.8 | Translation map (`<EnumLabel>` / `useEnumLabel` / `labels.ts`) |
| C1.9 | Enum-rendering lint scan |
| C1.10 | Routing skeleton + 6 placeholder pages |

## Scripts

```
pnpm --filter @manthanos/web dev         # vite dev server on 127.0.0.1:7374
pnpm --filter @manthanos/web build       # production build
pnpm --filter @manthanos/web typecheck   # type-only check
pnpm --filter @manthanos/web test        # vitest run
```

## API discovery (Sprint 2 M1 C1.6 decision)

- **Dev:** Vite proxies `/api/*` → `MANTHANOS_API_URL` (default
  `http://127.0.0.1:7373`). Set the env var if your daemon listens on
  a different port.
- **Build:** runtime reads `import.meta.env.VITE_API_BASE_URL`. Defaults
  to empty (relative paths; relies on the serving topology to route
  `/api` correctly).

## Architecture

- React 18, TypeScript 5.6, Vite 5.4.
- TanStack Query v5 for data fetching (M1 C1.7 plumbs the hooks).
- React Router v6 for routing (M1 C1.10 wires the route table).
- No component library. Hand-built primitives match the Screen
  Spec's voice better than off-the-shelf libraries.
- Talks to `@manthanos/api` over `fetch`. No SSR. No service
  worker. Pure client.
- Local-only: dev server binds to 127.0.0.1.

## Testing

vitest with `--passWithNoTests` to support packages with empty test
sets during scaffolding. Component-render tests (jsdom +
`@testing-library/react`) land alongside the placeholder pages in
M1 C1.10. At M1 C1.6 the only test is a module-load smoke that
catches import-time failures in `App.tsx`.
