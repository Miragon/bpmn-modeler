# `@miragon/bpmn-modeler-append-menu`

Replaces the flat dropdown that `bpmn-js-create-append-anything` shows when the
user clicks **Append element** on the context pad (or presses **A** in the
palette) with a custom **two-panel Preact overlay**. The left panel is a
searchable, category-filterable list of **element templates** with
hover-to-expand detail cards (implementation binding, property preview); the
right panel is a category-grouped palette of standard **BPMN elements** with
optional pinned favourites.

## How it works

`AppendMenuModule` registers a single bpmn-js DI service,
`appendMenuOverride` (`AppendMenuOverride`). The service **decorates**
`popupMenu.open()`: it intercepts only the `bpmn-append` and `bpmn-create`
providers and lets every other popup (e.g. `bpmn-replace`) fall through
untouched. Intercepted entries are pulled via `popupMenu._getContext(...)`,
split with `classifyEntries()` into template vs. standard-element groups, and
rendered into a `document.body` overlay. Selecting an entry unmounts the
overlay and runs the entry's **original** action (`executeEntryAction()`) — the
override changes only the presentation, never the command dispatch. It closes
itself on `contextPad.close`, `canvas.viewbox.changing`, and
`commandStack.changed`.

## Why this lives in its own library

- **It is a pure bpmn-js decorator with zero VS Code knowledge.** The overlay
  works in any bpmn-js host (Camunda 7 and 8 alike — it sits in the
  `commonModules` of `apps/bpmn-webview`). Keeping it out of the webview makes
  that "no host APIs" contract explicit and the module reusable.
- **It is a heavy, optional UI.** A multi-file Preact component tree plus CSS
  only matters once the append menu opens. Isolating it keeps that weight off
  the webview's core path and out of unrelated build graphs.
- **It depends on the element-templates infrastructure.** Enriching template
  entries pulls in `@miragon/bpmn-modeler-element-template-chooser`. As a
  separate package you only take that dependency when you register the module —
  the `elementTemplates` service is treated as optional, so plain BPMN elements
  still work without it.

## Usage

```ts
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";
import { CreateAppendElementTemplatesModule } from "bpmn-js-create-append-anything";

const modeler = new BpmnModeler({
    additionalModules: [
        ElementTemplateChooserModule,        // optional: enriches template entries
        CreateAppendElementTemplatesModule,  // must register before the override, so entries exist
        AppendMenuModule,
    ],
});

// Pin up to 6 element types to the top of the right panel.
modeler.get("appendMenuOverride", false)
    ?.setFavourites(["bpmn:ServiceTask", "bpmn:UserTask"]);
```
