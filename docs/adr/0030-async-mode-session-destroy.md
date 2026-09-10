# 0030 — `ModeSession.destroy()` returns a `Promise` and awaits the in-flight switch

- Status: accepted (#1489)
- Date: 2026-09-10
- Category: bpmn-webview

## Context

`createModeSession` ([ADR 0021](0021-mode-session-subpath.md)) owns the single
live surface for a page and switches modes through a multi-await `recreate()`
transaction: capture view state → export → `beforeDestroy` → destroy the old
surface → build the new one → load → apply. A `busy` flag drops concurrent
`requestMode` calls, but nothing coordinated `destroy()` with a switch already
in flight. The synchronous `destroy(): void` tore down only the *current*
handle, so a transaction running concurrently would continue past it, build a
fresh surface, and leave it live — the just-destroyed session resurrected, and
the old handle destroyed twice (#1489, epic #1506).

The same transaction had three more windows where it could leave zero or two
live surfaces (a throwing `captureViewState` wedged `busy`; a failed candidate
build/load leaked alongside the fallback; a throwing `beforeDestroy` orphaned
the original). Fixing those is internal, but closing the resurrection window is
not: `destroy()` cannot both be synchronous *and* guarantee the session owns no
live surface once it returns, because the surface it must tear down may only be
built several awaits later.

## Decision

`ModeSession.destroy()` becomes `destroy(): Promise<void>`. It flips a terminal
`disposed` flag and, if a switch is in flight, **awaits that transaction**
rather than destroying the current handle directly; the transaction observes
`disposed` at its next checkpoint and tears down whichever surface it owns.
When idle, it destroys the current handle synchronously before the first await,
so idle-path teardown timing is unchanged. `destroy()` is idempotent, and no
lifecycle callback fires after it.

The change is source-compatible for callers — a `void`-returning call site
compiles unchanged against a `Promise`-returning method, and neither in-repo
host (nor the demo) awaited or even called `destroy()`. It is breaking only for
a hypothetical external *implementer* of the `ModeSession` interface. The fix
therefore ships as `fix(bpmn-modeler): …` **without** a `!` breaking marker; the
API widening is recorded here instead.

## Alternatives considered

**Keep `destroy(): void` and cancel the transaction with a generation token.**
`destroy()` could bump a counter that the transaction checks and bail out
synchronously. But the surface a bailed-out transaction has already built still
needs tearing down, and a synchronous `destroy()` cannot await the build that
is mid-flight — it would return while a surface is still being constructed,
reintroducing the leak it set out to close. Awaiting is the only honest signal
that teardown is complete.

**A per-operation token instead of a boolean `disposed`.** Unnecessary while
`busy` drops concurrent requests: at most one transaction exists at a time and
`destroy` is terminal, so a boolean fully encodes the only invalidating event.
Should #1499 change drop-while-busy to *supersede* the running switch, a
per-op token becomes necessary — noted at the flag in `modeSession.ts`.

## Consequences

- Hosts that tear a session down during a mode switch can now `await
  session.destroy()` to know teardown finished; the VS Code / IntelliJ webview
  `bootstrap.ts` disposal path may adopt this but is not required to.
- The invariant the session now upholds: at every instant it owns 0 (after
  destroy) or exactly 1 live surface. A double factory failure is the only
  state that leaves 0 while still live — `getHandle()` returns the last
  (destroyed) handle and the next `requestMode` rebuilds. This is documented on
  `onError` in `publicApi.ts` and the README.
- `requestMode` and `setTheme` gain a `disposed` guard, so a toggle or theme
  change after `destroy()` is a silent no-op rather than touching a torn-down
  handle.
