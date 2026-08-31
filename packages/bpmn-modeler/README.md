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
