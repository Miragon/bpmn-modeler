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
| `modelNavigation` | `ModelNavigationPort` | jump-to-element / model navigation (engine-neutral — **also available on `/design` and `/viewer`** via their narrower `DesignerCapabilities` / `ViewerCapabilities`) |
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
| `{ module, config? }` | via your `/lint` import | On, with the per-mode default or a caller-supplied config. Rules the bundled resolver cannot resolve degrade gracefully and are reported via `LintRunEvent.unresolved` rather than failing the pass. |
| `{ module, results: "external" }` | via your `/lint` import | The modeler only *paints* results the host computes and pushes through `handle.applyLintResults(...)`; no in-webview linter runs. `module` is still required — the external tier needs it to paint and to service a `startInPageLinting` handback. |

### Config & mode

`config` is either a single `BpmnlintConfig` (applied verbatim in both modes) or
a `{ design?, implement? }` map, so one instance can lint Design and Implement
differently — the map is re-resolved on every `setMode`. Omitting `config`
selects the **per-mode default**:

| Mode | Default config |
| --- | --- |
| `implement` | `getDefaultLintConfig({ engine, preset: "modeling" })` — structural + Miragon modeling layer **plus** the Camunda deployability layer for `engine`. |
| `design` | `getDefaultLintConfig({ preset: "modeling" })` — the same base **without** the engine layer (the engine-neutral surface has no execution platform to check). |

A **workspace `.bpmnlintrc`** a host hands back through `startInPageLinting` is
mode-invariant: it applies to both modes unchanged, and a `setMode` while it is
active only stores the new mode. See [ADR 0023](../../docs/adr/0023-mode-aware-linting.md).

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

The [`@miragon/bpmn-modeler/mode`](#mode-session) session automates exactly this
hand-off (plus export-before-destroy and a post-destroy fallback), so most hosts
never write the switch by hand.

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

## Design & implement mode (runtime)

An **engine-tagged** model (Camunda 7 / 8) can be shown in a documentation-focused
**design** view *without* re-importing or losing engine data. This is a runtime
toggle on the **same** `createModeler` instance — same bpmn-js modeler, same
moddle, same behaviours, same command stack:

```ts
const modeler = await createModeler(canvas, {
    engine: "c8",
    propertiesPanel: { parent: panel },
    mode: "design", // "implement" (default) | "design"
    onModeChanged: (mode) => console.log("now in", mode),
});

modeler.setMode("implement"); // full Camunda surface — no re-import
modeler.getMode();            // "implement"
```

`"design"` reduces the properties panel to its engine-neutral surface (neutral +
host [custom groups](#surviving-design-mode) only) and hides the engine chrome —
the element-template chooser. It also **re-resolves the in-page lint config** for
the mode: Design drops the Camunda deployability layer (so `camunda-compat`
findings the neutral panel cannot act on disappear), and switching back restores
it — see [Linting tiers](#linting-tiers). A host-handed workspace config is
mode-invariant. The canvas chrome (minimap, token simulation, focus reticle) is
the same in every mode (ADR 0022). Because nothing in the DI module graph is
added or removed on a toggle, `zeebe:*` / `camunda:*` extensions are **never** at
risk: replace and copy-paste keep engine data in both modes, and the drill-down
plane, selection, and undo history survive the toggle.

> **Two routes, one epic.** This runtime toggle is for the **design ↔ implement**
> pair on an *engine-tagged* model. The separate [`/design` subpath](#design-mode)
> (`createDesigner`, a distinct factory) is for *untagged* models and lean hosts
> that want the Camunda stack out of their bundle entirely — it cannot round-trip
> engine data (it has no camunda/zeebe moddle), so it is not a substitute for
> `setMode`. Pick the runtime toggle to preserve engine data; pick the subpath for
> bundle purity.

> **Timer / multi-instance in design mode.** On an engine model these two groups
> are *wholesale-replaced* by the Camunda providers, so their neutral entries are
> not restorable and design mode simply omits them (a pure `/design` panel keeps
> them). See [ADR 0017](../../docs/adr/0017-engine-neutral-properties-panel-lib.md).

### `mode` is unrelated to `theme`

`setMode` (design/implement) and `setTheme` (light/dark) share the "mode" wording
but are independent — the internal theme controller's own `setMode(theme)` is a
private collision, not the handle method.

### `ModelerOptions`

The required fields stand up an instance; every other field turns off / replaces
a built-in or wires a host capability (see [Capabilities](#capabilities--default-overrides)).

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `engine` | `"c7" \| "c8"` | — (required) | Camunda engine version. Switching engines = `destroy()` + a new instance. |
| `propertiesPanel` | `{ parent: HTMLElement }` | — (required) | The per-instance panel host. |
| `mode` | `"design" \| "implement"` | `"implement"` | Initial design/implement mode; toggle live with `setMode`. |
| `elementTemplates` | `object[]` | — | Initial element templates as data (never a path). |
| `settings` | `Partial<BpmnModelerSetting>` | — | Align-to-origin, transaction boundaries, favourites. |
| `linting` | `LintingOptions` | off | Lint tier — see [Linting tiers](#linting-tiers). |
| `clipboard` | `ClipboardOptions` | native | Clipboard override for sandboxed hosts. |
| `theme` | `"light" \| "dark" \| "automatic"` | `"automatic"` | Colour theme (independent of `mode`). |
| `locale` | `string` | `"en"` | UI locale (page-global). |
| `capabilities` | `ModelerCapabilities` | — | Host ports (model navigation, code link, scripting). |
| `additionalModules` / `moddleExtensions` | `unknown[]` / `Record<string, object>` | — | bpmn-js [escape hatches](#escape-hatches). |
| `onContentSaved` / `onLintResults` / `onLintingToggled` / `onWarning` / `onElementTemplatesErrors` / `onModeChanged` | callbacks | — | Outbound notifications. `onModeChanged(mode)` fires once per actual mode change. |

### `BpmnModelerHandle`

| Method | Meaning |
| --- | --- |
| `loadDiagram(xml)` / `exportDiagram()` / `newDiagram()` / `getDiagramSvg()` | Load / serialise the diagram. |
| `setElementTemplates(templates)` | Push a new template set (data, never a path). |
| `setSettings(settings)` | Merge a partial settings update (`colorTheme` excluded — theme is host policy). |
| `viewport` / `selection` | Viewport (zoom/scroll/fit) and selection accessors. |
| `captureViewState()` / `applyViewState(state)` | [View state](#view-state-capture--restore) capture/restore across an instance switch. |
| `setTheme(theme)` | Switch the colour theme live. |
| `setMode(mode)` / `getMode()` | Switch / read the design-implement mode live (fires `onModeChanged`). |
| `applyLintResults(results)` / `applyLintingDisabled()` / `startInPageLinting(config?, token?)` | Host-driven lint state. |
| `getService(name)` | Reach a [core service](#core-services--escape-hatch) or the escape hatch. |
| `destroy()` | Tear the instance down. |

### Surviving design mode

A host that registers its own properties-panel provider groups can keep them
visible in design mode by marking their ids on the `customPropertiesGroups` DI
registry (an escape hatch reached through `getService`):

```ts
modeler.getService<{ registerGroups(ids: readonly string[]): void }>(
    "customPropertiesGroups",
).registerGroups(["myCustomGroup"]);
```

Neutral BPMN groups survive automatically; only host-added groups need marking.
The same `customPropertiesGroups` registry is available on the [design](#design-mode)
surface and on the [viewer](#viewer)'s opt-in readonly panel.

## Viewer

`@miragon/bpmn-modeler/viewer` is a **readonly** surface for view-only
permissions and embedded previews. It wraps bpmn-js's `NavigatedViewer` (mouse +
keyboard pan/zoom) plus the selection outline, an opt-in **readonly**
engine-neutral properties panel (#1443), an opt-in **model-navigation**
context-pad entry (#1445 — the one interaction a readonly surface still offers),
and the browser-only
[diff rendering primitives](#diff) (`DiffViewer`, `DiffLegend`, `DiffNavigator`,
`DiffPaneCoordinator`), plus the mode-invariant canvas chrome every surface
shares — the minimap, the readonly token-simulation variant, and the canvas
focus reticle (ADR 0022). The Camunda editor stack (camunda-bpmn-js, CodeMirror,
lint) stays out of its module graph, so it survives single-file bundlers that
inline everything reachable. The `DiffLegend` does
pull the shared i18n translator in for its labels (#1439), and opting into the
panel pulls in `@bpmn-io/properties-panel`/preact.

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
| `propertiesPanel` | `{ parent: HTMLElement }` | — | Opt-in **readonly** properties panel: the engine-neutral panel renders into `parent` with every entry disabled (the viewer registers no `modeling` service). Omitted ⇒ no panel modules load, no DOM added. |
| `capabilities` | `ViewerCapabilities` | — | Engine-neutral host ports. Navigation-only: `{ modelNavigation }` — the one interaction a readonly surface still offers. Present ⇒ a diagram-js context pad with only the navigate entry is registered; omitted ⇒ no `contextPad` service. Same [C8 caveat](#designeroptions) as `/design`. |
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
`newDiagram`, `setElementTemplates`, `setSettings`, linting, clipboard, or
events; the only host capability is the opt-in `modelNavigation` (see
[`ViewerOptions`](#vieweroptions)).

`getService` is typed against `CoreViewerServices` — the readonly `Pick` of the
[core services](#core-services--escape-hatch): `canvas`, `elementRegistry`,
`eventBus`, `overlays`, `selection`. The editing services (`modeling`,
`commandStack`) are **not registered** on a viewer — even with the properties
panel or model-navigation capability registered — so resolving one throws: the
surface is readonly by construction, not by convention. `contextPad` is
registered **only** with `capabilities.modelNavigation`, and even then it is
diagram-js's plain pad (not bpmn-js's, whose provider injects `modeling`)
carrying only the navigate entry; without the capability, resolving `contextPad`
throws too.

### Kept out of the module graph

`camunda-bpmn-js`, `codemirror` / `@codemirror/*`, `bpmnlint` /
`bpmn-js-bpmnlint`, `bpmn-js-create-append-anything`,
`camunda-transaction-boundaries`, and `minisearch` — the Camunda editor stack.
`bpmn-js-token-simulation` (its viewer module) and `diagram-js-minimap` **are**
present: engine-neutral canvas chrome shared by every surface (ADR 0022). The shared i18n translator
(`@miragon/bpmn-modeler-i18n`) **is** present, pulled in by `DiffLegend` for its
labels (#1439), and the engine-neutral panel fork (with
`@bpmn-io/properties-panel`/preact) enters the closure for the opt-in readonly
panel (#1443). The dedicated build-time purity gate was retired in #1439 as the
surface grows custom features; the viewer still imports **no CSS** and
`check:dts` still guards the dist surface.

### Theming & stylesheet

Load **`@miragon/bpmn-modeler/viewer.css`**, not `styles.css`: the viewer sheet
carries the bpmn-js base diagram/font CSS, the dark-theme diagram overrides,
the neutral diff markers + legend chip (so a diff consumer needs no other
sheet), the properties-panel chrome for the opt-in readonly panel, and the
minimap / token-simulation / focus-reticle chrome — none of the Camunda editor
chrome. The two overlap, so do **not** load both on a
viewer-only page.

## Design mode

`@miragon/bpmn-modeler/design` is an **engine-neutral, editable** surface for
documentation and conceptual modelling. It wraps the base bpmn-js `Modeler`
(palette, context pad, modelling, copy-paste, keyboard, search) plus an
engine-neutral properties panel (general / documentation groups only), a minimap,
and the neutral UX modules (translate, append menu, flow navigation). It loads
**none** of the Camunda editor stack — no camunda-bpmn-js, element templates, or
transaction boundaries — so it never carries an execution platform. Linting is
available on the same injection-only seam as the root (omit for none; the
engine-neutral Design config applies), and the lint *stack* still stays out of
the design chunk unless you inject it via `/lint`.

Three surfaces close the feature matrix:

| Surface | Entry | Editable | Engine | Properties panel |
| --- | --- | --- | --- | --- |
| Modeler | `@miragon/bpmn-modeler` | yes | Camunda 7 / 8 | engine-bound |
| Design | `@miragon/bpmn-modeler/design` | yes | none | plain BPMN |
| Viewer | `@miragon/bpmn-modeler/viewer` | no | — | neutral, readonly (opt-in) |

To switch a page *between* these surfaces behind a segmented control, reach for
the [mode session](#mode-session) — it orchestrates the three factories rather
than replacing them.

### Mode-marker semantics

The marker is the **absence of `modeler:executionPlatform`** on
`bpmn:Definitions`. Route with the exported `detectEngine(xml)`: `undefined` ⇒
this engine-neutral Design subpath (editable), a detected engine ⇒ Implement
(`createModeler`). Fallback for undetected XML is *editable Design*, not readonly.

This subpath and `createModeler` are **different factories** — moving between
them is a host concern (stamp or strip the execution platform on the XML,
`destroy()` the instance, stand up the other factory; the stamp/strip conversion
helpers are deferred to a follow-up, ADR 0016). It exists for *untagged* models
and lean hosts that need the Camunda stack out of their bundle. To show an
*engine-tagged* model in a design view without losing engine data, do **not**
route here — use the [runtime `setMode` toggle](#design--implement-mode-runtime)
on the same `createModeler` instance instead.

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
| `capabilities` | `DesignerCapabilities` | — | Engine-neutral host ports. Navigation-only: `{ modelNavigation }`. |
| `linting` | `LintingOptions` | off | Lint tier — see [Linting tiers](#linting-tiers). Injection-only; the engine-neutral Design config resolves automatically (a `{ design, implement }` map uses its `design` entry). |
| `onContentSaved` | `(e: ContentSavedEvent) => void` | — | Debounced diagram content (300 ms / 1000 ms maxWait). |
| `onLintResults` / `onLintingToggled` | callbacks | — | Lint-run findings and the in-canvas enable/disable toggle. |

There is no `engine`, `elementTemplates`, or `settings` — each is engine-bound
and rejected at compile time. Unlike the root `ModelerCapabilities`, the design
`capabilities` set is **navigation-only**: it accepts `modelNavigation`
(engine-neutral) and compile-time-rejects the engine-bound `codeLink` /
`scripting`.

> **C8 caveat.** Without a zeebe moddle, C8-shaped references
> (`zeebe:CalledElement` / `CalledDecision` / `FormDefinition`) parse as generic
> elements whose `$type` keeps the raw XML qname casing (`"zeebe:calledElement"`),
> so the exact `$type` match never fires and no navigate entry appears. Standard
> and C7 references (`calledElement`, `camunda:decisionRef`) work out of the box.
> A consumer who wants C8 navigation on `/design` passes
> `moddleExtensions: { zeebe: … }`.

### `BpmnDesignerHandle`

`loadDiagram`, `exportDiagram`, `newDiagram`, `getDiagramSvg`, `viewport`,
`selection`, `captureViewState`, `applyViewState`, `setTheme`, `getService`,
`applyLintResults`, `applyLintingDisabled`, `startInPageLinting`, and
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
`bpmn-js-element-templates`, `@miragon/create-append-c7`, and `minisearch`. The
lint stack (`bpmnlint` / `bpmn-js-bpmnlint` / `@miragon/bpmnlint-plugin-rules`)
is **also** absent from the design chunk **unless you inject it** via `/lint` —
the designer references only the lint *types*, so an omitted `linting` keeps the
stack out. A build-time gate (`scripts/check-design-pure-entry.mjs`) fails the
build if any of these reappears. Unlike
`/viewer`, `preact` and CodeMirror (`@codemirror/*`) **are** present (legitimate
dependencies of the engine-neutral properties panel), as are
`diagram-js-minimap` and `bpmn-js-token-simulation` — the engine-neutral canvas
chrome every surface shares (ADR 0022).

### Theming & stylesheet

Load **`@miragon/bpmn-modeler/design.css`**, not `styles.css`: the design sheet
carries the bpmn-js base diagram/font CSS, the engine-neutral panel and
append-menu chrome, the minimap, token simulation, the canvas focus indicator,
and the lint chrome (hide-until-configured, so it costs nothing unless you inject
linting), plus the dark-theme overrides — none of the Camunda editor chrome. The
two overlap, so do **not** load both on a design-only page.

## Mode session

`@miragon/bpmn-modeler/mode` is the View ↔ Design ↔ Implement session that owns
the single live surface for a page and switches it between modes: a
Design↔Implement change on a tagged model is a live `setMode` toggle
(undo/selection/plane survive), anything else exports → destroys → recreates →
restores the view state, with a post-destroy fallback so the page is never
handle-less. It value-imports **no** bpmn-js / Camunda code — **you inject the
per-mode surface factories** — so it stays out of a viewer-only consumer's bundle.

```ts
import { createModeSession, mountModeStrip } from "@miragon/bpmn-modeler/mode";
import "@miragon/bpmn-modeler/mode.css";
import { createModeler } from "@miragon/bpmn-modeler";
import { createViewer } from "@miragon/bpmn-modeler/viewer";
import { createDesigner } from "@miragon/bpmn-modeler/design";

const session = await createModeSession({
    container: document.querySelector("#canvas")!,
    engine: detectEngine(xml), // "c7" | "c8" | undefined
    // The present factories decide the available modes. On a tagged model the
    // `implement` factory serves *both* Design and Implement via `ctx.mode`.
    surfaces: {
        view: ({ container, theme }) =>
            createViewer(container, { theme, propertiesPanel: { parent: panel } }),
        design: ({ container, theme }) =>
            createDesigner(container, { theme, propertiesPanel: { parent: panel } }),
        implement: ({ container, theme, mode, engine }) =>
            createModeler(container, { engine, mode, theme, propertiesPanel: { parent: panel } }),
    },
    initialMode: savedMode, // vetted against availability + the engine rule
    onSurfaceCreated: (handle) => bindPerInstanceState(handle),
    onModeChanged: (mode, transition) => persist(mode),
});

// The session builds the initial surface but loads no diagram — you own the first import.
await session.getHandle().loadDiagram(xml);

// The strip is a separate opt-in export; it renders a group only for two+ modes.
const strip = mountModeStrip({
    stripEl,
    host: panel,
    modes: session.availableModes(),
    revealPanel: () => panelHandle.setVisible(true),
    onSelect: (mode) => void session.requestMode(mode),
});
strip.render({ mode: session.getMode(), engine, busy: false });
```

Supply a single factory and the session has one mode and the strip renders no
buttons (the "single mode ⇒ no buttons" guarantee):

```ts
const viewerOnly = await createModeSession({
    container,
    engine: undefined,
    surfaces: { view: ({ container, theme }) => createViewer(container, { theme }) },
});
viewerOnly.availableModes(); // ["view"] — mountModeStrip renders no group
```

### `ModeSessionOptions`

| Field | Type | Meaning |
| --- | --- | --- |
| `container` | `HTMLElement` | The shared canvas every surface mounts into. |
| `engine` | `DetectedEngine` | `"c7" \| "c8" \| undefined` — drives availability (`implement` needs a tagged model). |
| `surfaces` | `SurfaceFactories` | The per-mode factories you inject; the present set decides the available modes. |
| `initialMode` | `string \| null` | Requested start mode (saved / host default / `?mode=`), vetted by `resolveInitialMode`. |
| `theme` | `"light" \| "dark" \| "automatic"` | Forwarded to every surface and to `setTheme`. Default `"automatic"`. |
| `onSurfaceCreated` | `(handle, mode) => void` | After each factory returns, before `loadDiagram` — rebind per-instance subscriptions here. |
| `onModeChanged` | `(mode, transition) => void` | Once per applied change; `transition` is `"toggle"` / `"recreate"` / `"fallback"`. |
| `onSwitchStateChanged` | `(busy: boolean) => void` | Enters/leaves a recreate's handle-less window (drive `aria-busy` / `inert`). |
| `beforeDestroy` | `() => void \| Promise<void>` | Runs before `destroy()` on a recreate — flush pending host sync here. |
| `onError` | `(error: unknown) => void` | A switch failed (export-failure and post-destroy paths). |

### `ModeSession`

`getMode()`, `getHandle()`, `availableModes()`, `isAvailable(mode)`,
`requestMode(mode)` (ignored when unavailable / a no-op / mid-switch; resolves
when applied), `setTheme(theme)`, and `destroy()`.

### `mountModeStrip`

The segmented control + the collapsed-rail badge. `stripEl` is required; `host`
gets `data-surface-mode` / `aria-busy`, `resizerEl` hosts the badge, `revealPanel`
is the badge click, and `modes` (default all three) chooses which buttons render.
Below two modes it mounts no group and no badge. `translate` / `onLabelChange`
default to the package i18n; pass your own for a host with a different translator.

### Guaranteed absent from the module graph

`bpmn-js`, `diagram-js`, the Camunda engine stack (`camunda-*` / `zeebe-*`), the
lint stack, the bpmn-io panel primitives (`@bpmn-io/*`), and the engine-bound
properties panel. A build-time gate (`scripts/check-mode-pure-entry.mjs`) fails
the build if any reappears — the surfaces are injected, never imported.

### Theming & stylesheet

Load **`@miragon/bpmn-modeler/mode.css`** for the strip/panel-host chrome. Its
colours read the host's `--vscode-*` custom properties with static fallbacks, and
the dark rules engage under a descendant `[data-bpmn-theme="dark"]` scope, so they
work whether the attribute sits on `:root` or a container. Override the properties
you care about to re-skin it to your own design tokens.

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
`@miragon/bpmn-modeler/styles.css` (and, for a design-only page, in
`@miragon/bpmn-modeler/design.css`), which every consumer already loads — so
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

The engine-neutral properties panel shipped in the `/design` subpath is a fork
of [bpmn-js-properties-panel](https://github.com/bpmn-io/bpmn-js-properties-panel)
v5.65.0 (MIT, © camunda Services GmbH). See [`THIRD_PARTY_NOTICES`](./THIRD_PARTY_NOTICES)
for the full notice and the list of modifications.
