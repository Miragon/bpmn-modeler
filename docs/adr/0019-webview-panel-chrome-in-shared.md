# 0019 — Keep webview panel chrome in `libs/shared`, out of the publishable types package

- Status: accepted
- Date: 2026-09-04

## Context

The #1371 split sorted the old `shared` lib by one criterion: anything without
a protocol dependency moved to the publishable `@miragon/bpmn-modeler-types`.
That placed `propertiesPanelResizer.ts` and `propertiesPanelFocus.ts` there —
page-level webview chrome bound to hard-coded DOM ids (`js-panel-resizer`,
`js-properties-panel`) and the `p`/`Shift+P` shortcuts, consumed only by the
bpmn/dmn webview bootstraps. Both files carried `@internal` markers admitting
they are not part of the modeler public API, yet they were `export *`'d from
the package index. Once the package is published, callers can invoke
`initResizer` against a page that lacks the expected DOM and get a silent
no-op; removing the exports later would be a breaking change. The package is
not yet published, so the move is free today.

## Decision

Placement in `modeler-types` requires passing **both** criteria: no protocol
dependency *and* a surface worth publishing. The resizer/focus/shortcut chrome
fails the second, so it moves to `libs/shared` (private, already depended on
by both webviews). Only `isTextEditingSurface` — a pure DOM predicate also
used by the published package — stays in `modeler-types`
(`textEditingSurface.ts`).

The same rule moves `theme.ts` (the DMN-only `#theme-link` adapter — a
host-coupled, module-singleton helper consumed solely by the DMN webview
bootstrap, which the published package replaces with its own `ThemeController`):
protocol-free but not worth publishing, so it lands in `libs/shared` too.

## Alternatives considered

**A dedicated `libs/webview-chrome` package.** Cleaner concern-wise than the
protocol lib, but full workspace ceremony for two files; revisit if webview
chrome accumulates.

**Status quo (`@internal` doc markers).** A doc comment is not a fence — the
exports remain callable, and the liability compounds once the package gains
external consumers.

## Consequences

- `@miragon/bpmn-modeler-types` exposes no DOM-id-coupled entry points; its
  index is safe to publish as-is.
- `libs/shared` now contains browser chrome alongside the protocol — a known
  concern mix, accepted over the ceremony of a new package.
- `libs/shared` tests gain a `@miragon/bpmn-modeler-types` alias (the focus
  helpers import `isTextEditingSurface` from there), matching the alias-map
  pattern of the other lib vitest configs.
