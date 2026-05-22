# @manthanos/api

ManthanOS local HTTP daemon. Exposes the substrate
(`@manthanos/memory`, `@manthanos/orchestrator`, `@manthanos/providers`)
via versioned REST routes consumed by `apps/web`.

## Status

Sprint 1 — Task 1 scaffold. The daemon itself lands in Task 2.

## Local-only

The daemon binds to `127.0.0.1` only. It refuses non-loopback
connections. There is no authentication; the user owns the
workspace files and the daemon process.

## Scripts

```
pnpm --filter @manthanos/api build       # compile TypeScript
pnpm --filter @manthanos/api typecheck   # type-only check
pnpm --filter @manthanos/api test        # vitest suite
pnpm --filter @manthanos/api dev         # start daemon in dev mode
```

## Environment

| Variable | Default | Notes |
|---|---|---|
| `MANTHANOS_PORT` | `7373` | TCP port (loopback only) |
| `MANTHANOS_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `MANTHANOS_DATA_DIR` | `~/.manthanos` | Where workspaces live |

Set in your shell or in a `.env` file; the daemon does not ship a
config command in Sprint 1.
