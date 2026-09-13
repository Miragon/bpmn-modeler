# 0033 — Report failing debounced saves once through an `onError` channel

- Status: accepted
- Date: 2026-09-13

## Context

`createModeler` and `createDesigner` wire the host's `onContentSaved` callback
as an `asyncDebounce`d export fired on every `commandStack.changed`, with the
returned promise discarded via `void`. `asyncDebounce` fans one execution out
to *N* waiting callers: when a run rejects — an export failure, or a throw from
`onContentSaved` — it rejects every queued caller's promise. Because each is a
floating promise, a single failed save surfaced as one `unhandledrejection` per
queued edit, so embedders saw the same failure reported many times with no
supported callback to observe it.

The public `onContentSaved` was also typed `=> void`, so a host that returned a
promise (the natural shape for an async persist) had its rejection silently
swallowed rather than reported.

## Decision

Catch inside the debounced function and route the failure to a new public
`onError?: (error: unknown) => void` option on both `ModelerOptions` and
`DesignerOptions`, falling back to `console.error` when unset. The shared wiring
lives in one helper, `createContentSavedNotifier` (`src/contentSaved.ts`), that
both classes call. `asyncDebounce` itself is unchanged.

`onError`'s shape matches `ModeSessionOptions.onError` (ADR 0031's session
model). "Exactly once per debounced execution" holds by construction: one run
executes the `try` once, so at most one `catch`. Failures reported after
`destroy()` (an in-flight export racing teardown, e.g. `NoModelerError`) are
suppressed via an `isDisposed` predicate that closes over each class nulling its
`modeler` field on destroy — no separate flag.

`onContentSaved` is widened to `(event: ContentSavedEvent) => void | Promise<void>`
(backward-compatible), and the returned promise is awaited so its rejection is
caught by the same channel.

## Consequences

- A failing save reports once through a documented, observable channel; no more
  `unhandledrejection` fan-out, and later edits keep saving. Because Vitest
  fails a file on unhandled rejections, the unit specs double as the
  no-unhandled-rejection guarantee.
- Hosts that never set `onError` still see failures, now via `console.error`
  once instead of N unhandled rejections.
- The destroy-cancel behaviour from ADR 0031 / #1523 is untouched: `cancel()`
  still settles pending callers with `undefined`.
- The error surface is intentionally a flat per-instance callback, consistent
  with ADR 0007's flat-callback event model — not an event bus or a per-call
  result. Callers wanting the raw un-debounced signal still reach
  `commandStack.changed` through the `getService` escape hatch (ADR 0011).
