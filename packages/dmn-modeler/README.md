# @miragon/dmn-modeler

A host-free, embeddable DMN modeler for **Camunda**, built on
[dmn-js](https://github.com/bpmn-io/dmn-js). One `createModeler(container,
options)` call stands up an independent modeler — decision requirements diagram,
decision tables, literal expressions, a properties panel, and the Camunda
simulation module — with no VS Code / IntelliJ host required.

> Extracted from the [bpmn-modeler](https://github.com/Miragon/bpmn-modeler)
> monorepo. `0.1.0` is the first standalone release; the public surface is
> described by the TypeScript types shipped in `dist/index.d.ts`.

## Install

```sh
npm install @miragon/dmn-modeler
```

The dmn-js stack (`dmn-js`, `diagram-js`, `dmn-js-properties-panel`, …) ships as
real `dependencies`, so a single install pulls everything the modeler needs.

## Usage

```ts
import { createModeler } from "@miragon/dmn-modeler";
// The stock dmn-js component styles (needed to render at all):
import "@miragon/dmn-modeler/styles.css";

const canvas = document.querySelector("#canvas")!;
const panel = document.querySelector("#properties")!;

const modeler = await createModeler(canvas, {
    propertiesPanel: { parent: panel },
});

await modeler.loadDiagram(existingDmnXml);
const xml = await modeler.exportDiagram();
```

## Theming

Theming is **per-instance** and needs no extra `<link>`: importing
`@miragon/dmn-modeler/styles.css` (above) already ships both looks. The modeler
toggles a `data-dmn-theme="light" | "dark"` attribute on its container and
properties-panel parent, and the dark rules are scoped under
`[data-dmn-theme="dark"]`, so two modelers on one page can hold different themes.
`theme` defaults to `"automatic"` (follows `prefers-color-scheme` live); pass
`theme: "light"` / `"dark"` to pin one, or call `modeler.setTheme(...)` later.

```ts
const modeler = await createModeler(canvas, {
    propertiesPanel: { parent: panel },
    theme: "automatic", // "automatic" (default) | "light" | "dark"
});
```

**Legacy `#theme-link` fallback.** If you still link a theme stylesheet tagged
`id="theme-link"`, the modeler keeps swapping its href between
`@miragon/dmn-modeler/light-theme.css` and `.../dark-theme.css` as before — a
permanent, page-global compatibility path. It is optional; a missing
`#theme-link` is a silent no-op. Because it is page-global, it cannot express
per-instance themes — prefer the attribute mechanism (i.e. just `styles.css`).

> Caveat: setting `data-dmn-theme` on a page **root** element (`<html>`) themes
> everything below it. Mixing that with two instances that hold *different*
> per-instance themes would let the root value leak; a single-instance page or
> one that never sets the root attribute is unaffected.

The `locale` option is **reserved** — it is accepted so the API stays stable,
but has no runtime effect yet.

## Views

A loaded document exposes its views (`getViews`), the active view
(`getActiveView`), and lets you switch between them (`openView`). Each view is a
DRD, decision table, literal expression, or boxed expression editor.

```ts
const views = modeler.getViews();
await modeler.openView(views.find((v) => v.type === "decisionTable")!);
```

## Escape hatch

`modeler.getService(name)` reaches into the **active** dmn-js viewer's
dependency-injection graph by service name. The names and returned shapes are
**not** covered by this facade's API and may change without a major bump — prefer
a typed option or method where one exists.

```ts
const eventBus = modeler.getService("eventBus");
```

## Caveats

- **bpmn.io watermark.** dmn-js renders the bpmn.io logo. Per the bpmn.io
  license you must keep it visible unless you hold a commercial
  [bpmn.io license](https://bpmn.io/license/). Do not hide it in CSS.
- **Locale is page-global** in this release (the i18n instance is a singleton);
  theming is per-instance via the `data-dmn-theme` attribute (see
  [Theming](#theming)).
- **Bundler dedupe.** The modeler and its plugins must share single copies of
  `inferno` and the properties-panel / CodeMirror stack. If you build with Vite,
  add these to `resolve.dedupe`:

  ```ts
  resolve: {
      dedupe: [
          "inferno",
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

Apache-2.0 — see [`LICENSE`](./LICENSE). This package depends on third-party
software (dmn-js, diagram-js, dmn-js-properties-panel and the bpmn.io ecosystem,
and others); their respective licenses and the bpmn.io watermark requirement
continue to apply to your usage.
