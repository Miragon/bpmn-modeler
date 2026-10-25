# `@miragon/bpmn-modeler-append-menu`

Replaces the dropdown that `bpmn-js-create-append-anything` shows when the
user clicks **Append element** on the context pad (or presses **A**) or
**Create element** in the palette (or presses **N**) with a custom **two-panel
Preact overlay**. The left panel is a searchable, category-filterable list of
**element templates** with hover-to-expand detail cards (implementation
binding, property preview); the right panel is a category-grouped palette of
standard **BPMN elements** with optional pinned favourites and a description
card for the hovered or keyboard-highlighted element.

## How it works

`AppendMenuModule` registers a single bpmn-js DI service, `appendMenuOverride`
(`AppendMenuOverride`). The service **decorates** `popupMenu.open()`: it
intercepts only the `bpmn-append` and `bpmn-create` providers and lets every
other popup (e.g. `bpmn-replace`) fall through untouched. Intercepted entries
are pulled via `popupMenu._getContext(...)`, split with `classifyEntries()` into
template vs. standard-element groups (a template that declares `steps`
contributes one entry per leaf step), and rendered into a `document.body`
overlay. Selecting an entry unmounts the overlay and runs the entry's
**original** action (`executeEntryAction()`) — the override changes only the
presentation. The exception is a template that applies to several BPMN types:
the upstream action always creates one fixed type (`elementType.value`, else the
first `appliesTo` entry), so once the user picks a type in the right panel the
override creates and places the element itself (`executeTemplateTypeAction()`).
It closes itself on `contextPad.close`, `canvas.viewbox.changing`, and
`commandStack.changed`.

## Why this lives in its own library

- **It is a pure bpmn-js decorator with zero host knowledge.** The overlay
  works in any bpmn-js host, Camunda 7 and 8 alike. `@miragon/bpmn-modeler`
  inlines it and registers it in the `commonModules` of
  `packages/bpmn-modeler/src/modeler.ts` and on the design surface
  (`packages/bpmn-modeler/src/design/designer.ts`). It depends on bpmn-js
  (peer), Preact and the template chooser's `types` subpath, never on
  `@miragon/bpmn-modeler`, which keeps it reusable and testable on its own.
- **It is a heavy UI.** A multi-file Preact component tree plus CSS only
  matters once the append menu opens. Isolating it keeps that weight out of
  build graphs that never register it, such as the `/viewer` entry.
- **Element templates are optional.** Template entries are enriched from the
  `elementTemplates` service (bpmn-js-element-templates) when it is registered;
  without it, plain BPMN elements still work.

## Usage

```ts
import BpmnModeler from "bpmn-js/lib/Modeler";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
import { CreateAppendAnythingModule } from "bpmn-js-create-append-anything";

const modeler = new BpmnModeler({
    additionalModules: [
        CreateAppendAnythingModule, // provides the bpmn-append / bpmn-create menus
        AppendMenuModule,
    ],
});

// Pin up to 6 element types to the top of the right panel.
modeler.get("appendMenuOverride", false)
    ?.setFavourites(["bpmn:ServiceTask", "bpmn:UserTask"]);
```

Template entries additionally need `CreateAppendElementTemplatesModule` and a
module providing the `elementTemplates` service, as the engine stacks in
`packages/bpmn-modeler/src/engineStacks/` register them. On Camunda 7 that
service lacks `createElement`, so also register
`CreateAppendC7ElementTemplatesModule` from `@miragon/create-append-c7`.
