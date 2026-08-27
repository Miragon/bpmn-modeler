# 0007 — Fix the public `@miragon/bpmn-modeler` API surface before extraction

- Status: accepted (#1375)
- Date: 2026-08-27
- Category: bpmn-webview

Design spike for the modeler-npm-extraction epic (#1293, see
[ADR 0006](0006-extract-publishable-modeler-package.md)); lands the API
skeleton that #1373 (linting tiers), #1374 (clipboard polarity), and #1376
(package workspace) build against.

## Context

Epic #1293 extracts the host-free BPMN modeler composition out of
`apps/bpmn-webview` into a publishable npm package, `@miragon/bpmn-modeler`. The
prerequisites already landed: the public types split into `libs/modeler-types`
(#1371), per-feature capability ports (#1370), and instance-based
`createModeler` (#1372).

The remaining risk is the API itself. The current facade
(`app/createModeler.ts` + `app/modeler.ts`) grew to serve one caller — the VS
Code webview `bootstrap` — so its shape is *accidental*: a two-step
`create(engine)`, a flat `propertiesPanelParent`, an `extraModules` DI escape
hatch carrying clipboard/i18n/theme wiring, page-level side effects
(`initTheme`, `i18n.setLanguage`, panel resizer) done in an 836-line
`bootstrap.ts` rather than through options, and a `lintingHost` value object
required just to keep DI resolvable. If the extraction froze that shape, the
first published version would bake in the accidents.

This ADR fixes the complete public TypeScript surface **before** the package
exists, so #1376 moves code into a *designed* API. The deliverable of #1375 is
type-only: a compile-checked skeleton (`app/publicApi.ts`), a conformance +
scenario spec (`app/publicApi.spec.ts`), an `@internal` tagging pass, and this
record. No runtime refactor — the renames and new methods land in #1373/#1376.

## Decision

### Semver stance: the facade is the contract

The published contract is exactly the `createModeler` options, the instance
handle, and the outbound event model — the surface in `app/publicApi.ts`.
Everything else is free to change without a major bump:

- The **host ↔ webview `Query`/`Command` protocol** (`libs/shared`) stays
  private and freely refactorable. It is an internal transport, not API. The
  eslint `BND-PROTOCOL-PRIVATE` rule already forbids the publishable layers from
  importing it.
- The **bpmn-js DI service graph** reached through `getService` is an
  explicitly unstable escape hatch (see below).
- The host-capability port *forwarders* and DI *module factories*
  (`createModelNavigationModule`, `createCodeLinkModule`,
  `createInlineScriptingModules`) are package-internal composition wiring; a
  consumer enables a feature by supplying its port through `capabilities`, never
  by calling a factory.

### The three-category feature taxonomy

Every capability the modeler exposes belongs to exactly one category. The
category decides its default and how a consumer changes it.

| Category | Default | How to change it | Members |
|---|---|---|---|
| **[A] Engine-intrinsic** | Always present | n/a — it *is* the modeler | load/export/new/SVG, viewport, selection, element templates, settings, engine |
| **[B] Opinionated built-in** | On, sensible default | One option to turn off; one option to replace | linting, clipboard, theme, locale |
| **[C] Host capability** | Off | Supply a port through `capabilities` | model navigation, code link, inline scripting |

Events (`onContentSaved`, `onLintResults`, `onLintingToggled`, `onWarning`,
`onElementTemplatesErrors`) are a fourth, cross-cutting concern: strictly
outbound notifications, tagged in the skeleton but not a category.

### The opinionated-defaults corollary

A host-less consumer that calls `createModeler(container, { engine,
propertiesPanel })` gets a fully-featured modeler: linting on with the bundled
ruleset, the native clipboard, automatic theming, English UI. Every built-in is
**one option away** from off and **one override away** from replaced — `linting:
false`, `clipboard: { bridge }`, `theme: "dark"`, `locale: "de"`. This is what
makes the package pleasant for the demo/standalone consumers while still letting
VS Code and IntelliJ override each built-in with their host-mediated version.

### Engine in options, async factory

The target factory is:

```ts
createModeler(container: HTMLElement, options: ModelerOptions): Promise<BpmnModelerHandle>
```

with a required `engine`. Two reasons the return is a `Promise`: #1373's lint
tier lazy-loads its bpmnlint chunk, forcing a construction await anyway; and an
async factory lets the package do first-diagram/i18n setup before resolving. A
host that learns the engine late simply constructs late — today's `bootstrap`
already constructs the modeler only after the file handshake. Switching engines
is `destroy()` + a new instance, not a mutation.

The current two-step `create(engine)` is documented `@internal` as the migration
path; #1376 collapses it into the async factory.

### Event model: flat typed callbacks, not one `onEvent` bus

Outbound notifications are individual typed `on*` option callbacks. #1373
already decided `onLintResults`/`onLintingToggled` as top-level callbacks; typed
individual callbacks are more discoverable for a vanilla factory API than a
single tagged-union `onEvent({source, event, data})` bus, and a future React
adapter can trivially fan them into its own `onEvent`.

Content-out is a package-owned **debounced** `onContentSaved({ xml })` (300 ms,
1000 ms maxWait — the shape battle-tested in `bootstrap`, mirroring
camunda-web-modeler's `content.saved`). Every consumer needs that debounce;
raw `commandStack.changed` stays reachable through `getService`.

**An event is never a substitute for a capability port.** A callback can only
announce that something happened; it cannot answer a question or resolve a
target. "Navigate to this reference" is a `ModelNavigationPort`, not an
`onNavigateRequested` event, because the host must be able to resolve
asynchronously and the modeler must stay ignorant of how. This is why the ports
widen to `void | Promise<void>` (see Consequences) instead of becoming events.

### `@internal` without tooling — for now

`@internal` is applied as a **TSDoc documentation contract** only. There is no
api-extractor, no `exports`-map trimming, and no lint rule enforcing it in this
spike. Marking a symbol `@internal` states intent ("not part of the published
API") so the extraction and reviewers have a single source of truth; mechanical
enforcement is deferred to #1376/#1379.

### `getService` stays public but unstable

The DI escape hatch is kept on the public handle deliberately, so advanced
integrations and plugin authors are not blocked while the typed surface catches
up — but documented as unstable (not semver-covered): bpmn-js service names can
change across minor versions. Reaching for it is a signal a typed option/method
is missing and should be filed.

## Validation

Every signature was checked against the real consumers. `app/publicApi.spec.ts`
encodes the checks as compile-time assertions.

- **demo-webapp** (`demo/bpmn/main.ts`, `demo/bpmn/dual.ts`): a
  `capabilities.modelNavigation`-only options literal type-checks; code-link and
  scripting stay omitted, so their UI genuinely never renders. `dual.ts`'s
  two-instance mount maps onto two independent `createModeler` calls, each with
  its own `propertiesPanel.parent`.
- **bpm-iq scenario 1 — data-in element templates**: `elementTemplates?:
  object[]` accepts fetched JSON; there is no path-based variant.
- **bpm-iq scenario 2 — async model navigation**: `ModelNavigationPort.openReference`
  accepts an `async` implementation (GitHub-API resolution before opening a
  tab). The widened `void | Promise<void>` return is what makes this type-check;
  the modeler still treats the call as fire-and-forget.
- **bpm-iq scenario 3 — graceful `{ config }` lint degradation**: a `linting: {
  config }` literal type-checks against the structural `BpmnlintConfig` mirror;
  unresolvable rules degrade at runtime and are reported through
  `onLintResults({ results, unresolved })` rather than failing the pass.
- **conformance**: the current `BpmnModeler` class is assignable to the *stable
  subset* of `BpmnModelerHandle` (`StableModelerSurface`) — proof the extraction
  can adopt the handle type without reshaping already-frozen members.

Note: bpmn-webview has no `tsc` gate in CI (its `build` is `vite build` and its
`test` is `vitest run`, both esbuild — types are stripped, not checked). The
conformance spec is therefore enforced at authoring time via `tsc -p
apps/bpmn-webview/tsconfig.spec.json`. Wiring a type-check gate is a #1376/#1379
follow-up (see below).

## Alternatives considered

- **A single `onEvent({ source, event, data })` bus** (camunda-web-modeler's
  shape). Less discoverable for a vanilla factory; a React adapter can synthesize
  it from the typed callbacks, not the other way round.
- **Path-based element templates** (`elementTemplates: string`). Couples the
  package to a filesystem and a host; data-in keeps it host-free.
- **Sync-only capability ports.** Scenario 2 needs async resolution before the
  navigation completes; sync ports would force the host into fire-and-forget
  hacks. Widening to `void | Promise<void>` costs nothing and unblocks it.
- **api-extractor / `exports`-map trimming now.** Real enforcement is worth
  doing, but it is package-workspace work (#1376/#1379), not part of fixing the
  API shape. Adding it here would couple this spike to a build-tooling decision.

## Consequences

- The extraction (#1376) moves code into a designed API. The runtime deltas it
  and #1373/#1374 must apply are captured as a **rename/reshape map**:

  | Current | Target | Landing in |
  |---|---|---|
  | `create(engine)` second step | `engine` in options, async factory | #1376 |
  | `propertiesPanelParent` | `propertiesPanel: { parent }` | #1376 |
  | `extraModules` | `additionalModules` | #1376 |
  | `lintingHost` value object | `onLintingToggled` callback | #1373 |
  | `getService("bpmnLintConfig")` render calls | `linting` option + `applyLintResults`/`applyLintingDisabled` | #1373 |
  | `setElementTemplates(JSON[] \| undefined)` | `setElementTemplates(object[])` | #1376 |
  | page-level `initTheme`/`setColorThemeMode` | `theme` option + `setTheme()` | #1376/#1377 |
  | page-level `i18n.setLanguage` + `TranslateModule` | `locale` option | #1376 |
  | `VsCodeClipboardModule` via `extraModules` | `clipboard: { bridge }` | #1374 |

- The capability ports widen to `void | Promise<void>` now (a small, real,
  behaviour-neutral change — all callers already ignore the return value), so
  async host implementations type-check against the frozen ports.
- `@internal` tags mark the host-adapter-only instance methods (scripting,
  `applyImplementationStatus`, `alignElementsToOrigin`, `rootElement`,
  `onCommandStackChanged`, the two-step `create`), the page-level webview chrome
  in `libs/modeler-types` (`theme`, `propertiesPanelResizer`,
  `propertiesPanelFocus`, `canvasResize`), the `app/` host-adapter modules
  (`host`, `state`, `webviewState`, `keyboardFocus`, `canvasFocusIndicator`,
  `propertiesPanelClipboard`, `rootElement`), and the port module factories.


## Follow-ups

- #1373 — linting tier ladder + `onLintResults`/`onLintingToggled` runtime.
- #1374 — clipboard polarity flip (native default, `clipboard: { bridge }`).
- #1376 — package workspace; collapse `create(engine)` into the async factory;
  apply the rename/reshape map; wire a `tsc` type-check gate for the package.
- #1377 — relocate the VS Code `<body>`-class theme watcher to the host adapter;
  inject the per-instance `theme` mode.
- Promote the non-protocol utilities that landed in `libs/shared` by accident
  (`processVariables`, `variableManifest`, `asyncDebounce`) to a home the
  publishable package can import.
- Add disposers for the manager `on*` subscriptions
  (`onCommandStackChanged`, `onElementTemplatesErrors`) so the async handle can
  be torn down cleanly.
- #1379 — mechanical `@internal` enforcement (api-extractor or `exports` map).
