# `@miragon/bpmn-modeler-element-template-chooser`

Replaces `@bpmn-io/element-template-chooser` with a richer overlay for picking
an element template. When the user clicks **Select** in the properties panel's
template section, a modal opens with a searchable, category-filterable template
list on the left and a live detail preview on the right (description,
documentation link, and a breakdown of inputs / outputs / properties), with
keyboard navigation and apply-on-Enter/double-click.

## How it works

`ElementTemplateChooserModule` registers the `elementTemplateChooser` bpmn-js
DI service. It listens for the properties panel's `elementTemplates.select`
event, asks `elementTemplates.getLatest(element)` for the applicable (not
already applied) templates, renders the Preact overlay into a `position: fixed`
container mounted on the canvas parent, and on confirm calls
`elementTemplates.applyTemplate(element, template)`. Property bindings are
classified (`classifyBinding`) and the implementation summary is derived
(`extractImplementationDetail`) for both Camunda 7 (`camunda:topic`,
`camunda:class`, …) and Camunda 8 (`zeebe:taskDefinition:type`, …) shapes.

## Why this lives in its own library

- **It is Preact JSX in a non-React webview.** The overlay is written in TSX
  with a `/** @jsx h */` pragma; the surrounding `apps/bpmn-webview` code does
  not bundle React/Preact globally. Isolating the UI as a source-only package
  gives it its own JSX compilation boundary so the pragma doesn't leak into —
  or break — the rest of the webview build. (Several other libs here, e.g.
  `append-menu`, reuse this chooser's `ElementTemplate` types.)
- **It is a self-contained properties-panel integration.** All it needs from the
  host is the bpmn-js `elementTemplates` service; keeping it separate keeps the
  overlay reusable in any bpmn-js application and lets its UX evolve
  independently.

## Usage

```ts
import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";

new BpmnModeler({ additionalModules: [ElementTemplateChooserModule] });
```

The DI container wires the service automatically; it subscribes to
`elementTemplates.select` and shows the overlay when the properties panel's
template **Select** button is pressed.
