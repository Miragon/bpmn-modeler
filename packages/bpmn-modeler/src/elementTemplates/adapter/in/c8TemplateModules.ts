import ElementTemplateIconRendererModule from "@bpmn-io/element-template-icon-renderer";
import { CloudElementTemplatesPropertiesProviderModule } from "bpmn-js-element-templates";
import { CreateAppendElementTemplatesModule } from "bpmn-js-create-append-anything";

import type { EngineTemplateModules } from "./engineTemplateModules";

export const c8TemplateModules: EngineTemplateModules = {
    leading: [
        ElementTemplateIconRendererModule,
        CloudElementTemplatesPropertiesProviderModule,
        CreateAppendElementTemplatesModule,
    ],
    trailing: [],
};
