# @manthanos/web

ManthanOS novice-facing web UI. React + Vite. Consumes
`@manthanos/api` via `http://127.0.0.1:7373`.

## Status

Sprint 1 — Task 1 scaffold. The onboarding flow + product surfaces
land starting in Sprint 2 (Task 11).

## Scripts

```
pnpm --filter @manthanos/web dev         # vite dev server on 127.0.0.1:7374
pnpm --filter @manthanos/web build       # production build
pnpm --filter @manthanos/web typecheck   # type-only check
```

## Architecture

- React 18, TypeScript, Vite.
- No component library. Hand-built primitives match the Screen
  Spec's voice better than off-the-shelf libraries.
- Talks to `@manthanos/api` over `fetch`. No SSR. No service
  worker. Pure client.
- Local-only: dev server binds to 127.0.0.1.
