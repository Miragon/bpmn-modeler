# `@miragon/bpmn-modeler-element-template-chooser`

Replaces `@bpmn-io/element-template-chooser` with a searchable overlay for picking an element template:
a filterable list on the left, a preview of the template's description, documentation link, inputs,
outputs and properties on the right. `@miragon/bpmn-modeler` registers it for both engines (`commonModules`
in `src/modeler.ts`).

Internal workspace, not published on its own.

## How it works

- `ElementTemplateChooserModule` registers `elementTemplateChooser`. It listens for the properties panel's
  `elementTemplates.select`, offers the applicable templates from `elementTemplates.getLatest(element)`, and
  applies the choice with `elementTemplates.applyTemplate(element, template)`.
- `classifyBinding` and `extractImplementationDetail` read both Camunda 7 (`camunda:topic`,
  `camunda:class`, ...) and Camunda 8 (`zeebe:taskDefinition:type`, ...) bindings.
- `append-menu` reuses the template types. Because the engine-neutral `/design` entry reaches them, value
  imports go to subpaths such as `/types`, never the barrel, which pulls in the DI module, minisearch and
  the CSS. `packages/bpmn-modeler/src/architecture.spec.ts` enforces this.

## Usage

On a plain bpmn-js modeler, register it next to the properties panel and a module that provides
`elementTemplates`:

```ts
import Modeler from "bpmn-js/lib/Modeler";
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from "bpmn-js-properties-panel";
import { ElementTemplatesPropertiesProviderModule } from "bpmn-js-element-templates";
import camundaModdle from "camunda-bpmn-moddle/resources/camunda.json";
import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";

new Modeler({
    container: "#canvas",
    propertiesPanel: { parent: "#js-properties-panel" },
    moddleExtensions: { camunda: camundaModdle },
    additionalModules: [
        BpmnPropertiesPanelModule,
        BpmnPropertiesProviderModule,
        ElementTemplatesPropertiesProviderModule,
        ElementTemplateChooserModule,
    ],
});
```

On Camunda 8, use `CloudElementTemplatesPropertiesProviderModule` with the Zeebe moddle instead.
