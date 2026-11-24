import camundaModdle from "camunda-bpmn-moddle/resources/camunda.json";
import CamundaPlatformBehaviorsModule from "camunda-bpmn-js-behaviors/lib/camunda-platform";
import {
    CamundaPlatformPropertiesProviderModule,
    CamundaPlatformTooltipProvider,
} from "bpmn-js-properties-panel";
import { ElementTemplatesPropertiesProviderModule } from "bpmn-js-element-templates";
import { CamundaVariableResolverModule } from "@bpmn-io/variable-resolver";
import ColorPickerModule from "bpmn-js-color-picker";
import {
    CreateAppendAnythingModule,
    CreateAppendElementTemplatesModule,
    RemoveTemplatesModule,
} from "bpmn-js-create-append-anything";
import { CreateAppendC7ElementTemplatesModule } from "@miragon/create-append-c7";
// The CJS entry wraps the ESM module in a default export, preventing DI registration under Vite.
import TransactionBoundariesModule from "camunda-transaction-boundaries/lib/index.js";
import { composeUpstreamModules } from "./sharedModules";
import type { EngineStack } from "./engineStack";
import { C7_POPUP_MENU_ANNOTATIONS } from "./popupMenuAnnotationOverrides";

export const c7Stack: EngineStack = {
    upstreamModules: composeUpstreamModules([
        CamundaPlatformBehaviorsModule,
        CamundaPlatformPropertiesProviderModule,
        ElementTemplatesPropertiesProviderModule,
        ColorPickerModule,
        CreateAppendAnythingModule,
        CamundaVariableResolverModule,
        RemoveTemplatesModule,
    ]),
    engineModules: [
        CreateAppendElementTemplatesModule,
        CreateAppendC7ElementTemplatesModule,
        TransactionBoundariesModule,
    ],
    moddleExtensions: { camunda: camundaModdle },
    propertiesPanelDefaults: { tooltip: CamundaPlatformTooltipProvider },
    popupMenuAnnotations: C7_POPUP_MENU_ANNOTATIONS,
};
