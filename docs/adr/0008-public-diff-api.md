# 0008 — Public diff API: serializable data layer, promoted primitives, in-page coordinator

- Status: accepted (#1378)
- Date: 2026-08-30
- Category: bpmn-webview

Last feature of the modeler-npm-extraction epic (#1293, see
[ADR 0006](0006-extract-publishable-modeler-package.md) /
[ADR 0007](0007-public-modeler-api.md)). The package (#1376) and the thin
bpmn-webview adapter (#1377) have landed; the diff view is the remaining feature
still split across private layers.

## Context

BPMN diffing existed only as private, host-coupled code:

- The `bpmn-js-differ` computation lived **twice, near-verbatim** — in the
  extension engine (`BpmnDiffService.computeAndBroadcast`) and in the dev-mode
  MockHost (`ensureCachedDiff`). Neither was importable by an out-of-repo
  consumer.
- The rendering primitives (`DiffViewer`, `DiffLegend`) already sat in the
  package but were exported `@internal`, gated on this issue.
- Two-pane viewport/cursor lockstep existed only as the host-relayed protocol
  (`SyncViewportQuery`/`SyncCursorQuery`), unusable by an in-page consumer such
  as bpm-iq (the named validation consumer: a PR diff computed from two fetched
  XML strings).

The goal: make diffing available data-first (a serializable result usable in
Node) with the UI optional, without changing any host's behaviour.

## Decision

### Three layers, deliberately separated

1. **Data layer — a new private lib `libs/bpmn-diff`** (`@miragon/bpmn-modeler-diff`).
   `computeDiff(beforeXml, afterXml): Promise<DiffResult>` is the single home
   for the moddle-parse → `bpmn-js-differ` → flow-order-sort pipeline that was
   duplicated. `DiffResult` is plain JSON (id arrays + counts + a merged
   `navigationOrder`), so it survives `JSON.parse(JSON.stringify(...))` and
   crosses a webview↔host boundary or a cache untouched. The lib is inlined
   into the package like the other private libs; `modeler-core` imports it
   directly (layering forbids `libs → packages`), which is why the computation
   lives here rather than in `modeler-types` (kept type-mostly).

2. **A `./diff` package subpath** exposes the data layer as its own Vite lib
   entry with no CSS/bpmn-js/i18n imports, so it is **Node-safe**. The rendering
   primitives and the coordinator stay on the root entry.

3. **Promoted primitives + an in-page coordinator** on the root entry:
   `DiffViewer`/`DiffLegend` shed their `@internal` tags; a new `DiffNavigator`
   holds the portable stepper logic (paint filter, pruned cycle, anchor walk,
   cursor); and a new `DiffPaneCoordinator` arms viewport lockstep and a shared
   cursor across two in-page panes. The host-relayed protocol
   (`SyncViewportQuery`/`SyncCursorQuery`) is **untouched** — it remains the
   transport for the multi-webview VS Code / IntelliJ diff.

Diff is thus a **companion surface** beside `createModeler`, extending ADR 0007's
taxonomy: the data layer is engine-intrinsic-like (always available, Node-safe),
the primitives are opt-in building blocks, and the relayed protocol stays a
private transport.

### Supporting calls

- **Diff vocabulary types move to the data lib.** `DiffSide`/`DiffCounts` (plus
  new `DiffResult`/`DiffSideView`) are *defined* in `libs/bpmn-diff`;
  `libs/modeler-types/src/diff.ts` re-exports `DiffSide`/`DiffCounts`
  **type-only** so every existing importer keeps compiling. `DiffOrigin` and
  `Viewport` stay in `modeler-types` (host/presentation vocabulary). The
  re-export carries no runtime edge, so there is no import cycle.
- **`bpmnFlowOrder.ts` moved** from `modeler-types` into `libs/bpmn-diff` — its
  only consumers were the two diff computation sites, and it is self-contained.
- **`computeDiff` throws** on failure; `BpmnDiffService` keeps its catch +
  `notifier.logError`. `bpmn-moddle` stays behind a dynamic `import()`
  (preserving the `default ?? BpmnModdle` bundler-interop shim verbatim);
  `bpmn-js-differ` is a static import because dynamic-importing it tripped
  api-extractor's declaration roll-up — it still lands only in the `./diff`
  chunk, which production webview consumers reach lazily.
- **One navigation core.** `DiffNavigator` is the single implementation of the
  stepper; both `DiffPaneCoordinator` (in-page) and `DiffMode` (host-relayed)
  reuse it — no third copy of `findAnchor`/cursor logic.
- **`DiffLegend` sheds VS Code vocabulary.** Its context drops `DiffOrigin` for
  presentation props (`filename?`, `showSwap?`); the origin→props mapping moves
  to the app-side adapter (`diffMode.ts`).

### Mechanised gates

- A `node`-environment vitest suite and `tsconfig` `lib: ["ESNext"]` (no DOM)
  prove `computeDiff` is Node-safe at test and compile time.
- `scripts/check-diff-node.mjs` imports the built `dist/diff.js` under plain
  Node and runs `computeDiff`, catching DOM/CSS leakage into shared Rollup
  chunks at build time.
- `scripts/check-dts.mjs` now scans **both** entry `.d.ts` files and rejects
  invalid ambient declarations (a function rolled up with its body — the failure
  mode that forced the local-wrapper re-export of `computeDiff`/`sideView`).

## Alternatives considered

- **`computeDiff` in `modeler-types`.** Rejected: it would drag `bpmn-moddle` /
  `bpmn-js-differ` runtime deps into the type-mostly package and blur its role.
- **Root-entry-only (no `./diff` subpath).** Rejected: it would couple the data
  layer to the CSS/bpmn-js side-effect imports on the root entry, breaking Node
  safety — the whole point of the split.
- **A separate npm package for the data layer.** Rejected: inlining matches the
  epic's established pattern for private libs and avoids a second published
  artifact and its versioning.
- **A third copy of the stepper for the in-page coordinator.** Rejected in
  favour of extracting `DiffNavigator`.

## Consequences

- `DiffResult` and the exported signatures are the semver contract; the
  flow-order heuristics that decide *where* an id sorts are not.
- `BpmnDiffService` and both MockHosts now delegate to `computeDiff`; the
  duplicated differ code is gone. Hosts (VS Code, IntelliJ) are behaviourally
  unchanged — the relayed protocol and its adapters are untouched.
- `ApplyDiffHighlightsQuery`'s id-array params widened to `readonly string[]`
  (internal protocol, freely changeable per ADR 0007) to accept `DiffResult`'s
  readonly arrays without copies.
- `apps/demo-webapp` ships a new `bpmn/diff.html` two-pane page as the in-repo
  consumer of the coordinator.
