# `@miragon/bpmn-modeler-browser`

The DOM half of the shared browser code: the widgets and helpers both npm packages and the webviews use.
The diff legend and side label with `diffLegend.css`, the fit-to-view button with `canvasOverlays.css`, the
canvas fit and resize observer, the theme controller, the text-editing predicate, the keystroke focus
helper, the form-js runtime polyfills and `createElement`/`createButton`. Both npm packages inline it.

Internal workspace, not published on its own.

## The boundary

- Widgets and helpers only. The types and rules they use (the legend's state, slots and texts, the
  viewbox and canvas-size checks, the theme modes) live in
  [`@miragon/bpmn-modeler-types`](../modeler-types/README.md), which compiles without the DOM so a
  `domain/` file may import its domain entry (`@miragon/bpmn-modeler-types/domain`). A rule that does not touch the DOM goes there, not here.
- It is free of the private protocol, as `modeler-types` is: the ESLint rule `BND-PROTOCOL-PRIVATE`
  forbids `@miragon/bpmn-modeler-shared` here.
- A declaration here that a public type references ships in the published `.d.ts`, so the
  [`modeler-types` boundary](../modeler-types/README.md#the-boundary) on public API changes holds here too.

## Usage

```ts
import { isTextEditingSurface, observeCanvasSize } from "@miragon/bpmn-modeler-browser";
```

A stylesheet is imported by path, for example `libs/modeler-browser/src/diffLegend.css`.
