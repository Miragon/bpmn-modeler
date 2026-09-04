# 0017 — Engine-neutral properties panel via an inlined `@miragon/bpmn-modeler-properties-panel` fork

- Status: accepted (#1441)
- Date: 2026-09-03
- Category: bpmn-webview

Part of the "one document, three modes" epic (#1438), building on the design-mode
subpath [ADR 0016](0016-design-mode-subpath.md), the readonly-viewer subpath
[ADR 0014](0014-readonly-viewer-subpath.md), and the container-scoped theming of
[ADR 0012](0012-container-scoped-theming.md).

## Context

The epic needs one properties panel for three surfaces: the readonly **View**
(`/viewer`, #1443), engine-neutral **Design** (`/design`, #1196), and **Implement**
(Camunda 7/8 on `createModeler`, #1442). The upstream `bpmn-js-properties-panel`
cannot serve them all:

- **It cannot mount on a readonly viewer.** Its `cmd` module hard-injects the
  command stack (`CommandInitializer.$inject = ['eventBus', 'commandStack']`) and
  its base provider's entries call `useService('modeling')` / `commandStack` /
  `bpmnFactory` strictly, so construction throws on a `NavigatedViewer` (which
  registers none of those).
- **Its base provider is all-or-nothing.** bpmn-js binds exactly one panel
  renderer per instance; what varies at runtime is the registered provider set
  (`propertiesPanel.providersChanged`). To move between Design and Implement on
  one renderer we must own the neutral provider and a filter that composes with
  the engine providers, not fork behaviour into the renderer.
- **Readonly is not a first-class concept upstream.** The `@bpmn-io/properties-panel`
  primitives honour a per-entry `disabled` flag (text/select go readonly,
  FEEL/CodeMirror switch to `readOnly`), but upstream entry components drop the
  prop, and the ListGroup `add` / item `remove` buttons are not gated by it at all.

The neutral surface also cannot restore engine-replaced groups by filtering:
Camunda providers wholesale-replace `timer` (and C8 `multiInstance`), so their
neutral entries are gone by the time a filter runs.

## Decision

Ship a new **inlined workspace lib `@miragon/bpmn-modeler-properties-panel`** — a
fork of `bpmn-js-properties-panel` v5.65.0 (MIT) pinned alongside
`@bpmn-io/properties-panel` 3.52.0 and `bpmn-js` 18.25.1 — exporting four
composable bpmn-js DI modules. `/design` switches to it now; #1442 / #1443 consume
it later.

- **Renderer fork, command stack optionalised.** The `cmd` module injects the
  `injector` and resolves `commandStack` with `injector.get('commandStack', false)`,
  registering the multi-command handler only when present; the renderer keeps the
  `'config.propertiesPanel'` key and every public contract
  (`registerProvider` / `getEntryId` / `providersChanged` / `attachTo`) verbatim,
  so existing options and provider registrations are unchanged.
- **Readonly derived, not configured.** The renderer sets
  `readonly = !injector.get('modeling', false)` and passes it to the panel
  component, which — after the providers' groups→groups reduce — applies a pure
  `applyReadonly(groups)` transform: `disabled = true` on every entry (incl.
  ListGroup item entries) and `delete group.add` / `delete item.remove`. Applied
  in the component as the deterministic last step, it covers custom and
  third-party groups too and is unit-testable without a modeler.
- **Neutral provider.** A fork of the upstream standard-BPMN (`bpmn`) provider —
  same group ids (`general`, `documentation`, `error`, `multiInstance`, `timer`,
  …) and entry ids, so the C7/C8 providers still splice in (#1442) and existing
  i18n keys resolve. Its entries resolve `modeling` / `commandStack` /
  `bpmnFactory` optionally and forward `disabled` into the primitive options, so
  the same provider serves the viewer and the design modeler.
- **Mode filter.** A provider registered at priority 10 (below every implement
  provider — base 1000, C7/C8 500, templates 300, scriptLock 250, C8 data 100 —
  so its middleware runs last). `implement` mode is the identity; `design` mode
  allowlists neutral + host custom group ids, strips engine-appended entries
  (`versionTag`, the C7 error/escalation extras), and — per the epic decision —
  drops the wholesale-replaced `timer` / `multiInstance` groups when any engine
  group is present. A pure `/design` panel (no engine) keeps them.
- **Custom-group slot.** A `customPropertiesGroups` registry marks which extra
  group ids survive design mode. Hosts keep writing providers against the
  unchanged `registerProvider` contract; the filter treats a missing registry as
  an empty set.
- **Preact via per-file pragma.** Forked `.tsx` files carry
  `/** @jsxImportSource @bpmn-io/properties-panel/preact */` so they draw with the
  panel's vendored preact (the repo default is `preact`); the lib's Vitest config
  forces the production JSX runtime, since that vendored package exposes only a
  `jsx-runtime` folder, not `jsx-dev-runtime`.
- **Attribution.** The MIT notice ships both ways: `LICENSE-upstream` in the lib,
  a shipped `THIRD_PARTY_NOTICES` in the `@miragon/bpmn-modeler` package `files`,
  and a README attribution section. Every forked file carries a "Forked from
  bpmn-js-properties-panel v5.65.0" header.

`/design` now registers the four modules in place of upstream
`BpmnPropertiesPanelModule` + `BpmnPropertiesProviderModule`; the switch is
enforced by `architecture.spec.ts` (design allowlist swaps
`bpmn-js-properties-panel` for `@miragon/bpmn-modeler-properties-panel`), and the
lib is inlined into the package bundle/d.ts like the other private libs.

## Other considerations

Alternatives that avoid the fork were weighed and rejected:

- **Upstream provider + a low-priority "disable" provider.** The primitives
  honour `entry.disabled`, but the upstream entry components never forward the
  prop into the primitive options, and the entry factories are not exported for
  recomposition. Making them forward it *is* the entry fork under another name.
- **DI stubs instead of the renderer fork.** Registering a no-op `commandStack`
  (and friends) on the `NavigatedViewer` lets the upstream renderer mount and
  would have avoided the render-surface fork. Rejected: entries from custom or
  third-party providers would render enabled and silently no-op, ListGroup
  add/remove would stay clickable, and the upstream dist would stay in the
  design graph — the very thing that made the design surface untestable under
  Vitest (extensionless deep ESM imports).
- **CSS/DOM-level readonly** (`pointer-events: none`, mutation-observer
  disabling). Does not fix the DI crash, breaks keyboard access and a11y, loses
  text selection, and is brittle against upstream markup changes.
- **`yarn patch` against the upstream dist.** Still a fork in substance, but
  maintained as diffs against a bundled artifact — strictly harder to rebase
  than readable forked sources.
- **Contributing readonly support upstream.** The right long-term move, but
  outside our control and timeline. It remains the exit strategy: if
  `bpmn-js-properties-panel` gains optional injects plus `disabled`
  propagation, the fork shrinks to the mode filter and custom-group slot —
  which need no fork at all, being plain providers against the public
  `registerProvider` contract.

## Consequences

- **Manual upstream tracking.** The fork is pinned to
  `bpmn-js-properties-panel` 5.65.0 / `@bpmn-io/properties-panel` 3.52.0; a version
  bump means re-diffing the renderer + neutral entries and re-verifying the
  hard-coded engine ids in `modeFilter/engineGroupData.ts`.
- **Hard-coded engine id data.** The mode filter never imports the Camunda engine
  packages (forbidden by `check-design-pure-entry.mjs`); the C7/C8 group and entry
  ids it filters on are copied by hand and version-pinned.
- **Element icons dropped.** The forked header provider returns no element icon —
  the bundled SVG icon set lives only in the upstream dist, which the lib must not
  import. The header shows the element label + humanised type.
- **Timer / multi-instance dropped in design mode on an engine modeler.** Their
  neutral entries are not restorable once an engine replaces them, so an engine
  modeler switched to design mode simply omits those groups; pure `/design` keeps
  them.
- **Readonly and mode-filter behaviour are unit-proven; the full design graph
  still has no in-Vitest runtime spec.** `applyReadonly`, the mode filter, the
  custom-group slot, the neutral provider composition, and the renderer's readonly
  derivation (real diagram-js `EventBus` + stubbed canvas) all run in the lib's
  jsdom suite. `createDesigner.spec.ts` stays skipped — the fork's old
  extensionless-ESM blocker is gone, but the design graph still trips Vitest on
  the i18n overlay and on jsdom's missing SVG layout (ADR 0011). The end-to-end
  proof remains the demo page `apps/demo-webapp/bpmn/design.html`.
