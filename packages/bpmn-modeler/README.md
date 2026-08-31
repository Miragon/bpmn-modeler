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

Link **one** theme stylesheet and tag it `id="theme-link"`:

```html
<link id="theme-link" rel="stylesheet" href="/node_modules/@miragon/bpmn-modeler/dist/light-theme.css" />
```

`@miragon/bpmn-modeler/light-theme.css` and `.../dark-theme.css` are the two
themes. The default `theme: "automatic"` swaps the `#theme-link` href between
them, so that element **must** exist for automatic theming to work; pass
`theme: "light"` / `"dark"` to pin one.

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

### Overridden diagram-js defaults

Some diagram-js services are replaced under their own DI name because their
stock behaviour is wrong for a multi-plane editor:

| Service | Replacement | Why |
| --- | --- | --- |
| `rootElementsBehavior` | `StayOnPlaneBehavior` | The command stack is global, so diagram-js's version forces the canvas back to the plane a command was recorded on. Undoing after drilling into a sub-process would eject the user to the top level before the change is visible. The replacement still records the root but only applies it when the current plane no longer exists (e.g. the undone command created the sub-process being viewed). |

## Linting tiers

Linting is an opinionated built-in with a tier ladder, selected via
`options.linting`:

| `linting` | Behaviour |
| --- | --- |
| *(omitted)* | On, with the bundled default ruleset. |
| `false` | Off entirely — no chip, no overlay, no lint chunk loaded. |
| `{ config }` | On, with a caller-supplied `BpmnlintConfig`. Rules the bundled resolver cannot resolve degrade gracefully and are reported via `LintRunEvent.unresolved` rather than failing the pass. |
| `{ results: "external" }` | The modeler only *paints* results the host computes and pushes through `handle.applyLintResults(...)`; no in-webview linter runs. |

The linting stack (`bpmn-js-bpmnlint`, `bpmnlint`, the rule plugin, and its CSS)
is code-split into a lazily-loaded chunk: it is fetched only when an
instance actually lints, so `linting: false` keeps it out of your bundle's
critical path entirely. Lint results surface through `onLintResults`, and the
in-canvas enable/disable toggle through `onLintingToggled`.

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
