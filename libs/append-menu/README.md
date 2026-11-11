# `@miragon/bpmn-modeler-append-menu`

Replaces the dropdown of `bpmn-js-create-append-anything` (**Append element** on the context pad or `A`,
**Create element** in the palette or `N`) with a two-panel Preact overlay: element templates on the left,
BPMN elements by category with pinned favourites on the right. `@miragon/bpmn-modeler` registers it on
the modeler (`src/modeler.ts`) and the design surface (`src/design/designer.ts`).

Internal workspace, not published on its own.

## How it works

- `AppendMenuModule` registers `appendMenuOverride`, which decorates `popupMenu.open()`. Only the
  `bpmn-append` and `bpmn-create` providers are intercepted; every other popup (such as `bpmn-replace`)
  passes through.
- The override changes the presentation only: picking an entry runs the entry's original action
  (`executeEntryAction()`). The exception is a template that applies to several BPMN types: upstream
  always creates one fixed type, so after the user picks a type the override creates and places the
  element itself (`executeTemplateTypeAction()`).
- A template that declares `steps` contributes one entry per leaf step (`classifyEntries()`).
- The overlay closes on `contextPad.close`, `canvas.viewbox.changing` and `commandStack.changed`.
- It depends on bpmn-js (peer), Preact and the chooser's `types` subpath, never on
  `@miragon/bpmn-modeler`. Keep it that way: the `/viewer` entry must not pull in its weight.
- Without an `elementTemplates` service the template panel stays empty and plain BPMN elements still work.

## Usage

```ts
import BpmnModeler from "bpmn-js/lib/Modeler";
import { CreateAppendAnythingModule } from "bpmn-js-create-append-anything";
import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";

const modeler = new BpmnModeler({
    additionalModules: [CreateAppendAnythingModule, AppendMenuModule],
});

modeler.get("appendMenuOverride", false)?.setFavourites(["bpmn:ServiceTask", "bpmn:UserTask"]);
```

Template entries also need `CreateAppendElementTemplatesModule` and an `elementTemplates` service, as
`packages/bpmn-modeler/src/engineStacks/` registers them. On Camunda 7 that service lacks
`createElement`, so register `CreateAppendC7ElementTemplatesModule` from `@miragon/create-append-c7`
(1.0.1 or later) too.
