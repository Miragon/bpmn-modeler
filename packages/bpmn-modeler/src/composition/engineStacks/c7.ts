import camundaModdle from "camunda-bpmn-moddle/resources/camunda.json";
import CamundaPlatformBehaviorsModule from "camunda-bpmn-js-behaviors/lib/camunda-platform";
import { CamundaPlatformPropertiesProviderModule } from "bpmn-js-properties-panel";
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
import { TransactionBoundaryVisibilityModule } from "../../transactionBoundaries/adapter/in/TransactionBoundaryVisibility";
import { composeUpstreamModules } from "./sharedModules";
import type { EngineStack } from "./engineStack";
import { C7_POPUP_MENU_ANNOTATIONS } from "../../engines/domain/popupMenuAnnotationOverrides";
import { C7_PROPERTIES_PANEL_DEFAULTS } from "../../engines/adapter/in/c7EngineModules";

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
        TransactionBoundaryVisibilityModule,
    ],
    moddleExtensions: { camunda: camundaModdle },
    propertiesPanelDefaults: C7_PROPERTIES_PANEL_DEFAULTS,
    popupMenuAnnotations: C7_POPUP_MENU_ANNOTATIONS,
};
