import { ElementTemplatesPropertiesProviderModule } from "bpmn-js-element-templates";
import {
    CreateAppendElementTemplatesModule,
    RemoveTemplatesModule,
} from "bpmn-js-create-append-anything";
import { CreateAppendC7ElementTemplatesModule } from "@miragon/create-append-c7";

import type { EngineTemplateModules } from "./engineTemplateModules";

export const c7TemplateModules: EngineTemplateModules = {
    leading: [ElementTemplatesPropertiesProviderModule, RemoveTemplatesModule],
    // After the offer, whose `getDefault` the C7 polyfill reads.
    trailing: [CreateAppendElementTemplatesModule, CreateAppendC7ElementTemplatesModule],
};
