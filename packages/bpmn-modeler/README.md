# @miragon/bpmn-modeler

A opinionated, embeddable BPMN modeler for **Camunda 7 & 8**, built on
[bpmn-js](https://github.com/bpmn-io/bpmn-js). One `createModeler(container,
options)` call stands up an independent modeler — properties panel, linting,
clipboard, theming, and the Camunda element-template stack — with no VS Code /
IntelliJ host required.

> Extracted from the [miranum-ide](https://github.com/Miragon/miranum-ide)
> modeler. `0.1.0` is the first standalone release; the public surface is
> described by the TypeScript types shipped in `dist/index.d.ts`.

## Install

```sh
npm install @miragon/bpmn-modeler
```

The bpmn-io stack (`bpmn-js`, `diagram-js`, `camunda-bpmn-js`, …) ships as real
`dependencies`, so a single install pulls everything the modeler needs.

## Usage

```ts
import { createModeler } from "@miragon/bpmn-modeler";
// The modeler's own component styles:
import "@miragon/bpmn-modeler/styles.css";

const canvas = document.querySelector("#canvas")!;
const panel = document.querySelector("#properties")!;

const modeler = await createModeler(canvas, {
    engine: "c7", // "c7" | "c8"
    propertiesPanel: { parent: panel },
});

await modeler.loadDiagram(existingXml); // or modeler.newDiagram()
const xml = await modeler.exportDiagram();
```

### Theming

Theming is **per-instance** and needs no extra `<link>`: importing
`@miragon/bpmn-modeler/styles.css` (above) already ships both looks. The modeler
toggles a `data-bpmn-theme="light" | "dark"` attribute on its container and
properties-panel parent, and the dark rules are scoped under
`[data-bpmn-theme="dark"]`, so two modelers on one page can hold different
themes. `theme` defaults to `"automatic"` (follows `prefers-color-scheme` live);
pass `theme: "light"` / `"dark"` to pin one, or call `modeler.setTheme(...)`
later.

```ts
const modeler = await createModeler(canvas, {
    engine: "c7",
    propertiesPanel: { parent: panel },
    theme: "automatic", // "automatic" (default) | "light" | "dark"
});
```

**Legacy `#theme-link` fallback.** If you still link a theme stylesheet tagged
`id="theme-link"`, the modeler keeps swapping its href between
`@miragon/bpmn-modeler/light-theme.css` and `.../dark-theme.css` as before — a
permanent, page-global compatibility path. It is optional; a missing
`#theme-link` is a silent no-op. Because it is page-global, it cannot express
per-instance themes — prefer the attribute mechanism (i.e. just `styles.css`).

> Caveat: setting `data-bpmn-theme` on a page **root** element (`<html>`) themes
> everything below it. Mixing that with two instances that hold *different*
> per-instance themes would let the root value leak; a single-instance page or
> one that never sets the root attribute is unaffected.

## Capabilities & default overrides

Every feature the modeler exposes falls into one of three categories:

- **Engine-intrinsic** — the diagram surface itself (load/export XML, viewport,
  selection, engine). Always present; not a toggle.
- **Opinionated built-in** — on by a sensible default, but one option turns it
  off or replaces it: `linting`, `clipboard`, `theme`, `locale`.
- **Host capability** — off by default; you opt in by supplying a port through
  `options.capabilities`. **An absent capability means the feature's UI cannot
  appear** — no context-pad entries, no lock badges, no dead buttons.

The three optional capability ports (`ModelerCapabilities`) are:

| Capability | Port | Wires up |
| --- | --- | --- |
| `modelNavigation` | `ModelNavigationPort` | jump-to-element / model navigation |
| `codeLink` | `CodeLinkPort` | code ↔ diagram linking |
| `scripting` | `InlineScriptingPort` | inline script editing (**C7 only** — the C8 modeler leaves it unregistered even if the port is supplied) |

```ts
const modeler = await createModeler(canvas, {
    engine: "c7",
    propertiesPanel: { parent: panel },
    capabilities: {
        // Supply only the ports you back with a host; omit the rest.
        codeLink: myCodeLinkPort,
    },
});
```

## Escape hatches

For advanced hosts, two options pass straight through to bpmn-js:

- `additionalModules` — extra DI modules layered onto the bundled ones.
- `moddleExtensions` — extra moddle descriptors for a host's own BPMN
  namespace, so custom-namespaced XML parses into typed moddle objects (and
  the DI modules that depend on those types work). They are **merged onto** the
  engine's bundled `camunda`/`zeebe`/`modeler` moddles; a prefix colliding with
  one of those is **last-wins** (your descriptor overrides the engine's — don't
  do that).

```ts
const modeler = await createModeler(canvas, {
    engine: "c7",
    propertiesPanel: { parent: panel },
    moddleExtensions: {
        bpmiq: { name: "bpmiq", uri: "http://bpmiq/schema", prefix: "bpmiq", types: [] },
    },
});
```

### Detecting the engine from XML

`createModeler` needs an explicit `engine`. When a host opens an existing
diagram, `detectEngine(xml)` reads the spec-defined `modeler:executionPlatform`
(and, as a secondary signal, `modeler:executionPlatformVersion`) to pick it:

```ts
import { createModeler, detectEngine } from "@miragon/bpmn-modeler";

const engine = detectEngine(xml) ?? "c7"; // undefined = no platform metadata; the host picks the fallback
const modeler = await createModeler(container, { engine, propertiesPanel: { parent: panel } });
```

It returns `undefined` for engine-neutral diagrams that carry no platform
metadata, so the caller owns the fallback policy.

## Linting tiers

Linting is an opinionated built-in, but the lint stack is **injection-only**: it
lives behind the [`@miragon/bpmn-modeler/lint`](#lint) subpath and is never
bundled by the package. An on-tier passes a `module` you import from that
subpath, so a `linting: false` consumer keeps the whole stack out of its module
graph — in **every** bundling mode, including single-file bundlers where a
reachable internal dynamic import can no longer be tree-shaken.

| `linting` | Lint bytes in your bundle | Behaviour |
| --- | --- | --- |
| *(omitted)* | none | Off, with a one-time `console.info` migration nudge. |
| `false` | none | Off entirely — no chip, no overlay. Silent and explicit. |
| `{ module, config? }` | via your `/lint` import | On, with the default or a caller-supplied `BpmnlintConfig`. Rules the bundled resolver cannot resolve degrade gracefully and are reported via `LintRunEvent.unresolved` rather than failing the pass. |
| `{ module, results: "external" }` | via your `/lint` import | The modeler only *paints* results the host computes and pushes through `handle.applyLintResults(...)`; no in-webview linter runs. `module` is still required — the external tier needs it to paint and to service a `startInPageLinting` handback. |

```ts
import { createModeler } from "@miragon/bpmn-modeler";

const modeler = await createModeler(container, {
    engine,
    propertiesPanel: { parent: panel },
    // The dynamic import keeps the lint stack a separate lazily-fetched chunk;
    // omit `linting` (or pass `false`) and nothing here ever imports it.
    linting: { module: await import("@miragon/bpmn-modeler/lint") },
});
```

Lint results surface through `onLintResults`, and the in-canvas enable/disable
toggle through `onLintingToggled`.

## Core services & escape hatch

`handle.getService(name)` reaches a diagram-js/bpmn-js DI service by name. Seven
names form the frozen core contract (`CoreModelerServices`), and the overload
types them for you:

```ts
const canvas = handle.getService("canvas");       // typed as diagram-js Canvas
const modeling = handle.getService("modeling");   // typed as bpmn-js Modeling
```

| Name | Type |
| --- | --- |
| `canvas` | diagram-js `Canvas` |
| `commandStack` | diagram-js `CommandStack` |
| `elementRegistry` | diagram-js `ElementRegistry` |
| `eventBus` | diagram-js `EventBus` |
| `modeling` | bpmn-js `Modeling` |
| `overlays` | diagram-js `Overlays` |
| `selection` | diagram-js `Selection` |

Any other name is an unstable escape hatch — pass an explicit type argument
(`getService<MyService>("customTranslator")`) or take the `unknown` default:

```ts
const translate = handle.getService<{ translate(s: string): string }>("customTranslator");
```

**Semver:** the seven `CoreModelerServices` names resolve to their
bpmn-js/diagram-js-documented shapes across minor versions. Every other
`getService` name is unstable and may change or disappear without a major bump —
prefer a typed option/method, and open an issue if a name you need is missing.

## View state (capture / restore)

`handle.captureViewState()` snapshots *where the user is looking* — the
drill-down plane, the viewbox, and the selection — into a plain `ViewState`, and
`handle.applyViewState(state)` restores it. The same two methods and the same
`ViewState` type are on all three handles (`BpmnModelerHandle`,
`BpmnViewerHandle`, `BpmnDesignerHandle`), so they compose across a mode switch.

```ts
interface ViewState {
    viewport: ViewportData;
    rootElementId?: string;      // undefined ⇒ top-level plane
    selectedElementIds: string[];
}
```

The intended use is an **instance switch** (View ↔ Design ↔ Implement, which
destroys one bpmn-js instance and stands up another): capture on the old handle,
`destroy()` it, create the new one, `loadDiagram(...)`, then apply.

```ts
const state = current.captureViewState();
current.destroy();
const next = await createViewer(container);   // or createModeler / createDesigner
await next.loadDiagram(xml);
next.applyViewState(state);                    // same plane, viewbox, selection
```

Semantics:

- **Apply order is fixed: root → viewport → selection.** Viewbox coordinates are
  plane-relative, so the plane must switch first; the internals enforce this
  order, so callers never have to.
- **The top-level plane is never a stored id.** bpmn-js regenerates the implicit
  root's id on every import, so a top-level snapshot carries
  `rootElementId: undefined`, and applying `undefined` leaves the canvas on the
  top-level plane.
- **Stale references degrade gracefully.** A `rootElementId` whose sub-process no
  longer exists falls back to the top-level plane, and `selectedElementIds` that
  are gone are silently skipped — a snapshot taken against a since-edited diagram
  still applies without throwing.

## Clipboard wire format

Copy/paste defaults to the native browser clipboard; a sandboxed host
that cannot reach the system clipboard from the webview supplies a
`ClipboardBridge` via `options.clipboard`.

The wire format is **engine-agnostic**: a copied element serialises its full
moddle tree, and paste revives it against the *target* modeler's moddle. Pasting
across engines therefore **fails soft** — a Camunda-7 element pasted into a
Camunda-8 modeler revives its shared `bpmn:` base, and the reviver silently
drops every extension node whose `$type` the target moddle does not know
(`camunda:*` in a C8 moddle) instead of throwing. `clipboardWireFormat.spec.ts`
is the executable statement of this policy.

## Diff

The diff surface is a companion to `createModeler`, split in two so the data
layer runs anywhere:

- **`@miragon/bpmn-modeler/diff`** — a Node- **and** browser-safe subpath with
  no CSS, bpmn-js, i18n, or preact. `computeDiff(beforeXml, afterXml)` compares
  two documents and returns a serializable `DiffResult`.
- **`@miragon/bpmn-modeler/viewer`** — the browser-only rendering primitives
  (`DiffViewer`, `DiffLegend`, `DiffNavigator`) and the in-page two-pane
  `DiffPaneCoordinator`. They wrap the same readonly `NavigatedViewer` the viewer
  surface uses. *(Moved from the root entry in #1439; the root still re-exports
  them, but those re-exports are `@deprecated` and will be removed in a future
  major.)*

### `DiffResult` (the data layer)

`computeDiff` resolves to a plain-JSON `DiffResult` — it survives
`JSON.parse(JSON.stringify(result))`, so it crosses a webview↔host boundary or a
cache untouched:

| Field | Type | Meaning |
| --- | --- | --- |
| `added` | `readonly string[]` | ids present only in *after*, in flow order |
| `removed` | `readonly string[]` | ids present only in *before*, anchored into the after order |
| `changed` | `readonly string[]` | ids whose attributes changed |
| `layoutChanged` | `readonly string[]` | ids that only moved on the canvas |
| `counts` | `DiffCounts` | per-category counts (`{ added, removed, changed, layoutChanged }`) |
| `navigationOrder` | `readonly string[]` | merged, deduped, flow-sorted union — the order a stepper walks |

Ids are sorted by BPMN sequence-flow position (start event → end event) rather
than the differ's insertion order. `sideView(result, side)` projects the result
onto one pane's canvas (blanks `added` on `before`, `removed` on `after`).

```ts
// Node — no DOM required:
import { computeDiff } from "@miragon/bpmn-modeler/diff";

const result = await computeDiff(beforeXml, afterXml);
console.log(result.counts); // { added, removed, changed, layoutChanged }
```

### Two-pane diff (the browser)

```ts
import { computeDiff } from "@miragon/bpmn-modeler/diff";
import { DiffViewer, DiffLegend, DiffPaneCoordinator } from "@miragon/bpmn-modeler/viewer";
import "@miragon/bpmn-modeler/viewer.css";

const before = new DiffViewer(document.querySelector("#before")!);
const after = new DiffViewer(document.querySelector("#after")!);
await before.importXML(beforeXml);
await after.importXML(afterXml);

const coordinator = new DiffPaneCoordinator(before, after); // arms viewport lockstep
coordinator.apply(await computeDiff(beforeXml, afterXml));  // paints both panes

// One legend per pane, both stepping the shared cursor:
new DiffLegend(document.querySelector("#before")!, {
    onPrevious: () => coordinator.previous(),
    onNext: () => coordinator.next(),
}).update({ counts: (await computeDiff(beforeXml, afterXml)).counts });
```

`DiffPaneCoordinator` keeps the two panes' pan/zoom in lockstep and steps a
single shared cursor across both. Call `coordinator.destroy()` to unhook the
viewport subscriptions and `viewer.destroy()` to tear each pane down.

**Semver:** `DiffResult` and the exported signatures are the contract; the
flow-order heuristics that decide *where* an id sorts are not — they may change
without a major bump.

## Viewer

`@miragon/bpmn-modeler/viewer` is a **readonly** surface for view-only
permissions and embedded previews. It wraps bpmn-js's `NavigatedViewer` (mouse +
keyboard pan/zoom) plus the selection outline, and also carries the browser-only
[diff rendering primitives](#diff) (`DiffViewer`, `DiffLegend`, `DiffNavigator`,
`DiffPaneCoordinator`). The Camunda editor stack (camunda-bpmn-js, properties
panel, CodeMirror, token simulation, lint) stays out of its module graph, so it
survives single-file bundlers that inline everything reachable. The `DiffLegend`
does pull the shared i18n translator in for its labels (#1439).

```ts
import { createViewer } from "@miragon/bpmn-modeler/viewer";
import "@miragon/bpmn-modeler/viewer.css"; // the viewer's own lean stylesheet

const viewer = await createViewer(document.querySelector("#canvas")!, {
    theme: "automatic",
});
await viewer.loadDiagram(bpmnXml);

viewer.selection.onSelectionChanged((ids) => console.log("selected", ids));
```

### `ViewerOptions`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `theme` | `"light" \| "dark" \| "automatic"` | `"automatic"` | Colour theme; toggles a per-instance `data-bpmn-theme` attribute (same mechanism as the modeler). |
| `moddleExtensions` | `Record<string, object>` | — | Extra moddle extensions for a host's own BPMN namespace. |
| `additionalModules` | `unknown[]` | — | Escape hatch: extra render-only bpmn-js DI modules. |

### `BpmnViewerHandle`

`loadDiagram`, `exportDiagram`, `getDiagramSvg`, `viewport`, `selection`,
`captureViewState`, `applyViewState`, `setTheme`, `getService`, and `destroy` —
each **signature-identical** to its `BpmnModelerHandle` counterpart, so a modeler
handle narrows to a viewer handle with no adapter (a compile-time acceptance
criterion). `captureViewState` / `applyViewState` (see
[View state](#view-state-capture--restore)) make the viewer a valid target for a
mode switch — capture on the editor, apply on the viewer. There is no
`newDiagram`, `setElementTemplates`, `setSettings`, linting, clipboard,
capabilities, or events.

`getService` is typed against `CoreViewerServices` — the readonly `Pick` of the
[core services](#core-services--escape-hatch): `canvas`, `elementRegistry`,
`eventBus`, `overlays`, `selection`. The editing services (`modeling`,
`commandStack`) are **not registered** on a viewer, so resolving one throws —
the surface is readonly by construction, not by convention.

### Kept out of the module graph

`camunda-bpmn-js`, `bpmn-js-properties-panel`, `@bpmn-io/properties-panel`,
`preact`, `codemirror` / `@codemirror/*`, `bpmnlint` / `bpmn-js-bpmnlint`,
`bpmn-js-token-simulation`, `bpmn-js-create-append-anything`,
`camunda-transaction-boundaries`, and `minisearch` — the full Camunda editor
stack. The shared i18n translator (`@miragon/bpmn-modeler-i18n`) **is** now
present, pulled in by `DiffLegend` for its labels (#1439). The dedicated
build-time purity gate was retired in #1439 as the surface grows custom features;
the viewer still imports **no CSS** and `check:dts` still guards the dist surface.

### Theming & stylesheet

Load **`@miragon/bpmn-modeler/viewer.css`**, not `styles.css`: the viewer sheet
carries the bpmn-js base diagram/font CSS, the dark-theme diagram overrides, and
the neutral diff markers + legend chip (so a diff consumer needs no other sheet) —
none of the editor chrome. The two overlap, so do **not** load both on a
viewer-only page.

## Design mode

`@miragon/bpmn-modeler/design` is an **engine-neutral, editable** surface for
documentation and conceptual modelling. It wraps the base bpmn-js `Modeler`
(palette, context pad, modelling, copy-paste, keyboard, search) plus an
engine-neutral properties panel (general / documentation groups only), a minimap,
and the neutral UX modules (translate, append menu, flow navigation). It loads
**none** of the Camunda editor stack — no camunda-bpmn-js, element templates, token
simulation, transaction boundaries, or lint — so it never carries an execution
platform.

Three surfaces close the feature matrix:

| Surface | Entry | Editable | Engine | Properties panel |
| --- | --- | --- | --- | --- |
| Modeler | `@miragon/bpmn-modeler` | yes | Camunda 7 / 8 | engine-bound |
| Design | `@miragon/bpmn-modeler/design` | yes | none | plain BPMN |
| Viewer | `@miragon/bpmn-modeler/viewer` | no | — | none |

### Mode-marker semantics

The marker is the **absence of `modeler:executionPlatform`** on
`bpmn:Definitions`. Route with the exported `detectEngine(xml)`: `undefined` ⇒
Design (editable), a detected engine ⇒ Implement (`createModeler`). Fallback for
undetected XML is *editable Design*, not readonly. Switching modes is a host
concern — stamp or strip the execution platform on the XML, `destroy()` the
instance, and stand up the other factory. The stamp/strip conversion helpers are
deferred to a follow-up (ADR 0016); `detectEngine` already covers routing.

```ts
import { createDesigner, detectEngine } from "@miragon/bpmn-modeler/design";
import "@miragon/bpmn-modeler/design.css"; // the design surface's own stylesheet

const designer = await createDesigner(document.querySelector("#canvas")!, {
    propertiesPanel: { parent: document.querySelector("#panel")! },
    theme: "automatic",
});
await designer.loadDiagram(bpmnXml); // detectEngine(bpmnXml) === undefined

designer.getService("commandStack"); // editable: modelling services are present
```

### `DesignerOptions`

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `propertiesPanel` | `{ parent: HTMLElement }` | — (required) | The panel host, as in `createModeler`. Shows only the general / documentation groups. |
| `theme` | `"light" \| "dark" \| "automatic"` | `"automatic"` | Colour theme; toggles a per-instance `data-bpmn-theme` attribute. |
| `locale` | `string` | `"en"` | UI locale — Design mode has translatable UI (unlike the viewer). |
| `favouriteBpmnElements` | `string[]` | — | Element types offered first in the append/create menu. |
| `clipboard` | `ClipboardOptions` | native | Clipboard override for sandboxed hosts. |
| `moddleExtensions` | `Record<string, object>` | — | Extra moddle extensions for a host's own BPMN namespace. |
| `additionalModules` | `unknown[]` | — | Escape hatch: extra bpmn-js DI modules. |
| `onContentSaved` | `(e: ContentSavedEvent) => void` | — | Debounced diagram content (300 ms / 1000 ms maxWait). |

There is no `engine`, `linting`, `elementTemplates`, `settings`, or
`capabilities` — each is engine-bound and rejected at compile time.

### `BpmnDesignerHandle`

`loadDiagram`, `exportDiagram`, `newDiagram`, `getDiagramSvg`, `viewport`,
`selection`, `captureViewState`, `applyViewState`, `setTheme`, `getService`, and
`destroy` — each **signature-identical** to its `BpmnModelerHandle` counterpart,
so a modeler handle narrows to a designer handle with no adapter.
`captureViewState` / `applyViewState` (see
[View state](#view-state-capture--restore)) carry the user's plane, viewbox, and
selection across a mode switch. `getService` is typed
against `CoreDesignerServices`, which equals the full
[core services](#core-services--escape-hatch) set (`modeling` and `commandStack`
included) — the surface is editable by construction. `newDiagram()` uses the
base bpmn-js template, which carries **no** `modeler:executionPlatform`, so a
fresh diagram stays in Design mode.

### Guaranteed absent from the module graph

`camunda-bpmn-js`, `camunda-bpmn-moddle` / `zeebe-bpmn-moddle`,
`camunda-bpmn-js-behaviors`, `camunda-transaction-boundaries`,
`bpmn-js-token-simulation`, `bpmn-js-element-templates`,
`@miragon/create-append-c7`, `minisearch`, and the lint stack (`bpmnlint` /
`bpmn-js-bpmnlint` / `@miragon/bpmnlint-plugin-rules`). A build-time gate
(`scripts/check-design-pure-entry.mjs`) fails the build if any reappears. Unlike
`/viewer`, `preact` and CodeMirror (`@codemirror/*`) **are** present (legitimate
dependencies of the engine-neutral properties panel), as is `diagram-js-minimap`
(the engine-neutral minimap, a direct dependency of the package).

### Theming & stylesheet

Load **`@miragon/bpmn-modeler/design.css`**, not `styles.css`: the design sheet
carries the bpmn-js base diagram/font CSS, the engine-neutral panel and
append-menu chrome, the minimap, and the canvas focus indicator, plus the
dark-theme overrides — none of the Camunda editor chrome. The two overlap, so do **not**
load both on a design-only page.

## Lint

`@miragon/bpmn-modeler/lint` is the injectable lint stack (`bpmn-js-bpmnlint`,
`bpmnlint`, the rule plugin, and its CSS). The package never imports it — a host
that wants linting imports this subpath and hands the namespace to
`options.linting.module` (see [Linting tiers](#linting-tiers)). That injection
is what keeps the stack out of a `linting: false` consumer's bundle in every
bundling mode.

```ts
import { createModeler } from "@miragon/bpmn-modeler";
import "@miragon/bpmn-modeler/styles.css"; // includes the lint chrome CSS

// Static import — the stack ships in your main chunk:
import * as lint from "@miragon/bpmn-modeler/lint";
await createModeler(container, { engine, propertiesPanel: { parent }, linting: { module: lint } });

// …or dynamic — the bundler keeps it a separate lazily-fetched chunk:
await createModeler(container, {
    engine,
    propertiesPanel: { parent },
    linting: { module: await import("@miragon/bpmn-modeler/lint") },
});
```

The single export is `createLintModule` (matching the public `LintModule`
interface). The lint chrome's CSS is not code-split — it always lands in
`@miragon/bpmn-modeler/styles.css`, which every consumer already loads — so
importing the subpath brings no extra stylesheet wiring.

## Caveats

- **bpmn.io watermark.** bpmn-js renders the bpmn.io logo. Per the bpmn.io
  license you must keep it visible unless you hold a commercial
  [bpmn.io license](https://bpmn.io/license/). Do not hide it in CSS.
- **Locale is page-global.** The underlying i18n instance is a singleton, so
  `options.locale` sets the language for the whole page, not per instance. With
  several modelers on one page, the last `locale` wins. (A documented `0.1.0`
  limitation.)
- **Undo history does not survive an instance switch.** `captureViewState` /
  `applyViewState` carry the plane, viewbox, and selection across a
  `destroy()` + create, but the bpmn-js command stack belongs to the destroyed
  instance — the new instance starts with an empty undo history. Only the view
  state is preserved, not the edit history.
- **Bundler dedupe.** The modeler and its plugins must share single copies of
  `preact` and the properties-panel / CodeMirror stack. If you build with Vite,
  add these to `resolve.dedupe`:

  ```ts
  resolve: {
      dedupe: [
          "preact",
          "@bpmn-io/properties-panel",
          "@codemirror/state",
          "@codemirror/view",
          "@codemirror/language",
          "@codemirror/autocomplete",
          "@codemirror/commands",
          "@codemirror/lint",
          "@codemirror/search",
          "@lezer/common",
          "@lezer/highlight",
          "@lezer/lr",
      ],
  }
  ```

## License

Apache-2.0 — see [`LICENSE`](./LICENSE). This package bundles and depends on
third-party software (bpmn-js, diagram-js, camunda-bpmn-js and the bpmn.io
ecosystem, bpmnlint, and others); their respective licenses and the bpmn.io
watermark requirement continue to apply to your usage.
