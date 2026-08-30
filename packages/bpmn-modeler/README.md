# @miragon/bpmn-modeler

A opinionated, embeddable BPMN modeler for **Camunda 7 & 8**, built on
[bpmn-js](https://github.com/bpmn-io/bpmn-js). One `createModeler(container,
options)` call stands up an independent modeler — properties panel, linting,
clipboard, theming, and the Camunda element-template stack — with no VS Code /
IntelliJ host required.

> Extracted from the [miranum-ide](https://github.com/Miragon/miranum-ide)
> modeler (epic #1293). `0.1.0` is the first standalone release; the public
> surface is described by the TypeScript types shipped in `dist/index.d.ts`.

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

Link **one** theme stylesheet and tag it `id="theme-link"`:

```html
<link id="theme-link" rel="stylesheet" href="/node_modules/@miragon/bpmn-modeler/dist/light-theme.css" />
```

`@miragon/bpmn-modeler/light-theme.css` and `.../dark-theme.css` are the two
themes. The default `theme: "automatic"` swaps the `#theme-link` href between
them, so that element **must** exist for automatic theming to work; pass
`theme: "light"` / `"dark"` to pin one.

## Diff

The diff surface is a companion to `createModeler`, split in two so the data
layer runs anywhere:

- **`@miragon/bpmn-modeler/diff`** — a Node- **and** browser-safe subpath with
  no CSS, bpmn-js, i18n, or preact. `computeDiff(beforeXml, afterXml)` compares
  two documents and returns a serializable `DiffResult`.
- **root entry** — the browser-only rendering primitives (`DiffViewer`,
  `DiffLegend`, `DiffNavigator`) and the in-page two-pane `DiffPaneCoordinator`.

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
import { DiffViewer, DiffLegend, DiffPaneCoordinator } from "@miragon/bpmn-modeler";
import "@miragon/bpmn-modeler/styles.css";

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

## Caveats

- **bpmn.io watermark.** bpmn-js renders the bpmn.io logo. Per the bpmn.io
  license you must keep it visible unless you hold a commercial
  [bpmn.io license](https://bpmn.io/license/). Do not hide it in CSS.
- **Locale is page-global.** The underlying i18n instance is a singleton, so
  `options.locale` sets the language for the whole page, not per instance. With
  several modelers on one page, the last `locale` wins. (A documented `0.1.0`
  limitation.)
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
