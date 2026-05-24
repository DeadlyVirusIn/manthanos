# `apps/web` test patterns

A pragmatic reference for the recurring patterns in this directory.
Read this before adding a new mutation-flow test.

## Environment

- Default: **node**. Most pure-logic tests (renderers, helpers, label
  maps) live in node so they're fast and have no DOM cost.
- Opt-in: **jsdom**. Any test that mounts a React component or
  interacts with the DOM declares this at the top of the file:

  ```ts
  // @vitest-environment jsdom
  ```

- The jsdom env is **per-file**. Don't try to mix.

## Common helpers (copy from existing files, no shared util yet)

Each mutation-flow test rolls its own `makeFact()`, `makeConv()`,
`makeClient()`, `seed()`, `renderWith()`. They diverge enough between
flows (different shapes seeded, different routes) that we haven't
extracted a shared util. If you find yourself copy-pasting more than
50 lines of fixture code, that's the signal to extract.

## The `setQueryData` seeding pattern

jsdom **cannot reach the daemon**. Every read-side query a page makes
must be pre-seeded into the QueryClient cache before render, or the
page will transition to its error branch and your assertions will
fail in confusing ways. The shape is:

```ts
function seed(client: QueryClient, fact: FactView): void {
  client.setQueryData(factsKeys.detail(PROJECT_ID, FACT_ID), fact);
  client.setQueryData(factsKeys.provenance(PROJECT_ID, FACT_ID), makeProvenance());
  client.setQueryData(factsKeys.history(PROJECT_ID, FACT_ID), makeHistory());
}
```

If you forget one of the three, the page renders fine until that
specific query fails (`useFact` hits a network call that 404s in
jsdom) and the page swings into its error shell. The fix is always
"seed the missing query."

## QueryClient defaults for tests

Use this exact shape unless you have a specific reason not to:

```ts
function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,         // TanStack v5 quirk: prevents
                                     // errored cache from resetting
                                     // to 'pending' under SSR/jsdom
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
      mutations: { retry: false },
    },
  });
}
```

`retryOnMount: false` is load-bearing. Without it, TanStack v5
resets errored cache entries to `'pending'` when a component remounts
under jsdom — and your "this query is in error state" assertions
become flaky.

## The `invalidateQueries` testing pattern (the one most worth knowing)

### The problem

When a mutation succeeds, `useMutationStatus.onSuccess` calls
`queryClient.invalidateQueries({ queryKey })` for each declared key.
TanStack marks every matching query as stale **and triggers a refetch
of any currently-active query**. In jsdom, that refetch goes to the
network, fails (daemon unreachable), and the page transitions to its
error branch — **losing the success message you were about to assert
against** and breaking any test that wants to see the post-mutation
populated state.

### The two-half workaround

We can't make jsdom reach the daemon, so we split the proof into two
independent assertions instead:

**Half 1 — mutation correctness (this is the usual happy-path test).**
Spy on the mutation function and on `client.invalidateQueries`.
Assert that:
- the mutation function was called with the right args
- `invalidateQueries` was called with each expected key
- the success message rendered (via the page-level shell wrapper, see
  next section)

This proves the mutation fired correctly and invalidation requested
the right keys.

**Half 2 — post-mutation page state (only when you actually need it).**
For tests that need to verify the page lands on its new shell after
success (e.g. the C25.5 tombstone-transition test, the C25.6 same-id
revise test), **stub `invalidateQueries` to a no-op** and pre-seat
the cache yourself:

```ts
vi.spyOn(client, 'invalidateQueries').mockImplementation(async () => undefined);
vi.spyOn(apiConversations, 'tombstoneConversation').mockImplementation(async () => {
  // Pre-seat the new state in the cache directly. The next render
  // reads the new value; no refetch is triggered.
  client.setQueryData(
    conversationsKeys.detail(PROJECT_ID, CONVERSATION_ID),
    makeConv({ is_tombstoned: true, /* ... */ }),
  );
  return makeTombstoneResponse();
});
```

This isn't perfect — we're testing what the page renders given a
specific cache state, not what the real React Query + daemon stack
would produce. But it's the best we can do in jsdom and it catches
the structural defects (wrong shell branch, missing button hide,
sentinel rendering).

### When to use which

- **Default (mutation correctness):** the spy-and-assert-keys pattern.
  This is what most M2.5 happy-path tests do.
- **Stub invalidation:** only when the test name reads like
  "transitions to X UI on success" or "navigates to new id."
  Otherwise you're hiding the very behaviour you should be testing.

## The shell wrapper pattern

A page that hosts mutations wraps each render branch with a shell
that always renders the `MutationSuccessMessage` and (typically) the
dialogs. This is what makes the success message survive across the
loading / error / populated branches when invalidation triggers a
refetch.

- ConversationDetail: `renderConversationShell(projectId, conversationId,
  quotes, body, bundle)` with a `ConversationShellBundle` carrying
  every mutation's status and open-state.
- FactDetail: `withShell(body)` plus an always-mounted
  `ReviseFactDialog` for the same reason.

When you add a new mutation to one of these pages, extend the bundle
interface, update all five call sites (loading / error / missing /
tombstoned / populated), and add a new lifted status hook.

## TanStack v5 footguns we hit during M2.5

- **`mock.calls[0][0]` instead of `toHaveBeenCalledWith(input)`** —
  TanStack v5 passes mutation context as a second arg, so
  `toHaveBeenCalledWith(input)` fails with an unhelpful diff.
- **`await waitFor(...)` for post-mutation state** — TanStack's status
  transitions aren't synchronous after `act(click)`. Use `waitFor`
  for any `screen.getByTestId('...').textContent === 'success'`-style
  assertion that runs after a mutation submit.
- **`isPending` vs `isSubmitting`** — TanStack v5 renamed `isLoading` to
  `isPending`. Our framework re-exports `isSubmitting` (mapped from
  `status === 'pending'`) so consumers don't see the v4-to-v5 churn.

## React `renderToString` quirks (node-env tests)

- HTML-encodes apostrophes: `"Couldn't reach"` becomes
  `Couldn&#x27;t reach`. Test substrings should avoid apostrophes.
- Inserts `<!-- -->` between adjacent text and expression children.
  Regex assertions use `(?:<!-- -->)?` tolerance.

## Vocabulary discipline tests

Every mutation dialog ships a small "vocabulary discipline" suite
that asserts none of these appear in the dialog's visible text:

- raw substrate enum tokens (`tombstoned, skipped, extracted,
  superseded, contested`)
- `Workspace` (we say "project")
- ISO-8601 timestamps (we use `formatRelativeTime`)
- the user-hostile verbs (`Tombstone`, `Revise`, `Skip`) on buttons

These are substring exclusions scoped to the dialog root. They're a
safety net — they don't replace careful copy review. If you're adding
a new flow, copy the discipline block from `skip-extraction.test.tsx`
and adapt it.

## Double-submit guard (post-M2.5 fix)

`useMutationStatus` now drops a second synchronous `mutate(input)`
call while the first is in flight, and returns the existing in-flight
promise for duplicate `mutateAsync(input)` calls. The latch clears on
settle (success or error) and on `reset()`. See the
`useMutationStatus — double-submit guard` block in
`use-mutation-status.test.tsx` for the canonical assertions.

If your test needs to verify duplicate-click behavior at the dialog
level, fire two clicks inside a single `act` block, then assert that
your spy was called exactly once.
