# BPMN modeler features

- Status: accepted
- Last reviewed: 2026-11-14

## Context

Feature-level decisions inside `@miragon/bpmn-modeler` that are not part of its API, surface or
lifecycle contract, which are in [BPMN modeler](bpmn-modeler.md).

## Contents

- [Properties panel](#properties-panel)
- [Themes and locale](#themes-and-locale)
- [Linked form previews](#linked-form-previews)
- [Transaction boundaries](#transaction-boundaries)
- [Formatting and cleanup](#formatting-and-cleanup)
- [IDs from names](#ids-from-names)

## Decision

### Properties panel

An inlined `@miragon/bpmn-modeler-properties-panel` fork supplies the renderer, the neutral
provider, the mode filter and the custom-group registry. The upstream renderer and entries require
editing services and do not consistently propagate disabled state, so a disable-provider alone
cannot make them viewer-safe; DI stubs would leave enabled controls silently doing nothing and CSS
disabling would break keyboard access and selection.

- The fork keeps upstream provider/group contracts, resolves the command stack optionally and
  derives readonly from the absence of `modeling`; a final group transform disables all entries and
  removes add/remove actions, custom providers included.
- The mode filter runs at priority 10 after engine providers: Implement keeps their groups, Design
  keeps neutral and registered host-custom groups and removes engine entries. Camunda providers
  replace the timer and multi-instance groups wholesale, so those are omitted in tagged Design.
- Baseline is bpmn-js-properties-panel 5.65.0; engine group IDs and upstream assumptions need
  rechecking on dependency updates. Forked TSX uses the panel's vendored Preact and production JSX
  runtime. Preserve fork headers, `LICENSE-upstream`, package attribution and the shipped
  `THIRD_PARTY_NOTICES`.
- Upstream support for optional editing services and disabled propagation could remove most of the
  fork. Private-shape enforcement is in [Dependencies](dependencies.md#private-upstream-apis).

### Themes and locale

Each instance's `ThemeController` sets `data-bpmn-theme="light" | "dark"` on the canvas
and panel roots; theme always engages and `automatic` is the default. Overlays mounted
outside those roots copy the attribute onto their own root. The host themes its page
chrome through the private shared `hostTheme` adapter, and a host root theme must not
override differently themed instances. A destroyed instance ignores `setTheme` instead
of throwing, because a mode session forwards theme changes to the outgoing surface
while a recreate is in flight and then applies its current theme to the new surface.

The theme modes have one home, `SurfaceThemeMode` in `modeler-types`; the public
`ThemeMode`, DMN's `DmnThemeMode` and the host adapter's `HostThemeMode` are aliases of
it, so a new mode widens all three and the compiler names each place that must handle
it. Because the alias puts a published type in an inlined private library, each
package's `publicApi.spec.ts` pins its public name to the three values, so an edit
there fails the typecheck.

Author dark overrides once, scoped under the attribute; the main stylesheet combines
them with the upstream light base and the unscoped legacy light/dark sheets are derived
by stripping that scope. The light base imports each plugin's own stylesheet at the
pinned version, never another package's prebuilt copy (bpmn-js's `diagram-js.css`),
which is frozen at that package's build and drifts from the JS we run (#1670); an
architecture test rejects such imports. Mirroring an existing `#theme-link` remains a
supported silent fallback, since removing it would break existing consumers, and
authoring two theme sources would invite drift. The attribute/custom-property approach
also avoids newer CSS color features across IDE browsers.

Locale uses the shared page-global i18n singleton with the local extras overlay. The
designer and engine modeler register translation; the viewer has no locale option or
built-in TranslateModule (diff labels use i18n and a host may inject translation).
Independent instance themes do not imply independent locales.

### Linked form previews

Only the optional, protocol-free anchored `formPreview` capability is public: embedders must not
acquire the IDE protocol or form-js. The modeler owns selection and dismissal; the webview alone
owns form-js and the accessible nonmodal chrome. Both hosts read fresh *saved* bytes through the
core's saved-file resolution, never unsaved editor state (cost: unsaved form changes are not
shown). Unsupported components are rejected rather than widening the CSP, and form actions are
blocked. Optional policy hooks on `FormPreviewPort` let a host turn automatic previews off
without losing manual preview; omitted hooks keep backward compatibility, and the shared default
lives in publishable `modeler-types`. Persistence follows
[host settings ownership](intellij-bridge.md#host-replicated-state), and policy changes
preserve explicit previews and deliberate dismissal. The preview sits right of the selected task
and its context pad, clamped to the canvas; stable task association wins over avoiding overlap
with diagram elements. The index cannot tell missing from malformed JSON, so feedback names both.

Enforced by the [service](../../libs/modeler-core/src/navigation/service/FormPreviewService.spec.ts),
[reducer](../../libs/model-navigation/src/formPreviewState.spec.ts),
[webview](../../apps/bpmn-webview/src/adapter/out/formPreview.spec.ts) and
[browser](../../packages/bpmn-modeler/src/formPreview.browser.spec.ts) tests.

### Transaction boundaries

C7 surfaces render `camunda-transaction-boundaries` as HTML overlays, on by default
through `showTransactionBoundaries`. Upstream 1.1.2 does not make `show()` idempotent:
its `elements.changed` handler (an anonymous closure no wrapper can replace) runs
`hide()` + `show()`, so every edit removes and re-adds the overlay of every boundary in
the diagram. Debouncing would still rebuild every overlay once per edit, and an
incremental update from `event.elements` misses the former endpoints of deleted or
reconnected flows.

- The facade calls `show()`/`hide()` from `setSettings()` only when
  `showTransactionBoundaries` is present and differs from the service's `active` state,
  and shows the boundaries after every import (`loadDiagram()`, `newDiagram()`) because
  `diagram.clear` drops the overlays. This reaches npm consumers too: settings that
  arrive more than once no longer duplicate overlays.
- A Yarn patch in the root `resolutions` replaces the rebuild with a diffed sync: on
  every change it recomputes all marks in plain JS and touches overlays only for shapes
  whose marks or plane changed (a plane change re-adds its overlays, since Overlays
  re-checks plane visibility only on add, `root.set` and viewbox changes).
  Classification, placement and HTML stay as upstream ships them.
- The patch covers only hosts built here. `camunda-transaction-boundaries` is external
  in `@miragon/bpmn-modeler`, so npm consumers keep the per-edit rebuild until upstream
  fixes it. The patched-version constraint in `yarn.config.cjs` fails a bump until the
  patch is dropped or regenerated, the
  [equivalence spec](../../packages/bpmn-modeler/src/transactionBoundaries.browser.spec.ts)
  compares marks after edits, undos and redos with a full render, and the edit-burst pin
  in the [large-model counter spec](../../packages/bpmn-modeler/src/largeModelCounters.browser.spec.ts)
  fails if the patch stops applying. Drop the patch once upstream ships the fix.

### Formatting and cleanup

Wrap the exactly pinned `bpmn-auto-layout` 2.0.0-alpha.2 behind a `LayoutEngine` port that returns
geometry. The adapter takes XML but returns shape bounds and waypoints, never replacement XML: the
engine rebuilds DI from scratch, and applying only returned geometry preserves elements it omits and
avoids resetting the command stack through `importXML`. The semantic alpha was chosen over the older
grid engine because it handles pools, lanes, artifacts and labels; a custom engine would cost
substantial work and elkjs is a large generic engine without BPMN semantics. The port contains the
alpha dependency and permits a later replacement or worker adapter. Cost: an XML parse and layout
work on the webview's main thread, visible on large diagrams.

- Apply through `modeling.*` calls nested in one `layout.apply` handler's `preExecute` (one undo
  entry), suppressing child-recursive moves, automatic connection layout, attachment movement and
  adaptive label positioning that would modify the planned geometry a second time.
- Outcomes are a taxonomy the package owns: unsupported surfaces and empty diagrams are refused,
  `ENGINE_FAILED`, `APPLY_FAILED`, and `DIAGRAM_CHANGED` for an intervening edit, import, clear or
  destroy. The document revision is captured before the asynchronous export and verified after it
  and after layout, because relative deltas cannot safely apply to a changed diagram. `format()`
  resolves an outcome rather than rejecting, and `layout.formatted` reports it through one path
  (published as `onFormatted`). Concurrent format requests join one run.
- Cleanup is a separate, confirmed operation with an explicit failed outcome, and findings are
  recomputed before applying. Reachability and references come from moddle descriptors, not a
  hand-maintained property list that could mark valid elements for deletion. Formatting changes DI;
  cleanup deliberately changes the model.
- There is no format-on-save or spacing option (a full relayout must be explicit and the engine has
  no options), and formatting/cleanup stay outside `StableModelerSurface`.

The [real-model integration suite](../../libs/bpmn-layout/src/apply/integration.spec.ts) checks
semantic preservation and undo with a headless DOM that uses real matrix arithmetic and positive
text metrics, not inert layout stubs.

### IDs from names

Users want technical IDs that read like the element names. The Camunda Modeler plugin
rename-technical-ids runs as a [workspace plugin](bpmn-plugins.md), but no host can trigger it, it
renames with one undo step per element and it offers no review (#2339). The `libs/element-ids`
diagram-js library, inlined like the layout library, proposes and applies the IDs on the modeler and
the designer: names and IDs are engine-neutral.

- Spell an ID as the bundled rule `@miragon/rules/element-id-naming` checks it (by default
  `serviceTask_checkStock`; a process keeps its name only), so a generated ID never breaks the rule; a
  style setting would let IDs and lint drift apart. The library takes the rule's
  `ElementIdConvention` through a narrow `IdConvention` port, because the package keeps lint code out
  of its root and design entries; `createElementIdConvention` on the `/lint` subpath builds it. The
  core resolves the rule's options from the document's `.bpmnlintrc`, with what it extends, through
  the resolver `NodeBpmnLinter` lints with ([BPMN linting](bpmn-linting.md#linting)), and sends them
  as `ElementIdConventionQuery` whether or not linting runs.
- `proposeIds` keeps every proposal unique against all IDs the candidates do not give up (other model
  elements, DI, labels, planes) and counts an ID with a counter as following its name, so a second run
  changes nothing; a candidate that keeps its ID, an unnamed one too, holds it first. `orderRenames`
  orders the steps so none claims an ID still held, sending a cycle through one temporary ID; DI and
  label IDs follow through the same ordering.
- One `elementIds.rename` handler with only `preExecute`, like `layout.apply`, makes the rename one
  undo step. Element IDs change through `updateProperties`, a pool's process through
  `updateModdleProperties` plus `id.updateClaim`; a DI ID that still reads `<element ID>_di` and a
  label's registry ID follow. An empty selection runs no command, since it would still leave an undo
  step.
- The review belongs to the hosts, not the module: a panel in the canvas sits in the area bpmn-io
  owns, while each host has a native place for a list of pending changes. The module offers only a
  contract and no review UI, not even as a fallback. `proposeElementIds(unchecked?)` lists the rows
  (`ElementIdRow`: the current and new ID, kind, status, a counter flag and the element to reveal) for
  an unchecked set the host keeps, recomputed from the live diagram on every call;
  `renameElementIds(unchecked)` applies the checked ones; `setElementIdSettings({ followName?,
  convention?, openReview? })` hands "Review all IDs…" under the ID field to the host's panel, and
  without one the link is not offered. VS Code and IntelliJ draw the rows natively
  ([host integrations](architecture-and-hosts.md#host-integrations)).
- IDs follow names and types only when a host opts in (`elementIdsFollowName`, and
  `DesignerOptions.elementIdSettings` for a designer a mode switch builds): in the name change's
  `postExecute` and in `shape.replace`'s `postExecuted` below bpmn-js' priority 1500, one undo for
  both. Only an ID that bpmn-js or a template gave the element's kind, or one generated from the old
  name and type, follows; `Invoice_1` was typed by someone. A process ID is the deployment key, which
  the rule leaves out for the same reason: it never follows and starts unchecked in a review.

IDs in other files do not follow (call activities, a Camunda 8 process ID, tests, workers), and an open
inline-script editor keeps the old ID; both are documented, not detected. Naming IDs at creation from
lint rules (#1648) is complementary. The library's table-driven
[rule specs](../../libs/element-ids/src/proposals.spec.ts) and the
[browser spec](../../packages/bpmn-modeler/src/elementIds.browser.spec.ts), which checks references,
DI, labels, one undo, swaps, pools, collapsed sub-processes and the designer, enforce it.
