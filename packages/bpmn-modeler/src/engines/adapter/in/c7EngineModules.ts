import camundaModdle from "camunda-bpmn-moddle/resources/camunda.json";
import CamundaPlatformBehaviorsModule from "camunda-bpmn-js-behaviors/lib/camunda-platform";
import {
    BpmnPropertiesProviderModule,
    CamundaPlatformPropertiesProviderModule,
    CamundaPlatformTooltipProvider,
} from "bpmn-js-properties-panel";
import { CamundaVariableResolverModule } from "@bpmn-io/variable-resolver";
import ColorPickerModule from "bpmn-js-color-picker";

import type { EngineModules } from "./engineModules";
import { UpstreamPropertiesPanelModule } from "./upstreamPanel";

const C7_PROPERTIES_PANEL_DEFAULTS = { tooltip: CamundaPlatformTooltipProvider };

export const c7EngineModules: EngineModules = {
    modules: [
        UpstreamPropertiesPanelModule,
        BpmnPropertiesProviderModule,
        CamundaPlatformBehaviorsModule,
        CamundaPlatformPropertiesProviderModule,
        ColorPickerModule,
        CamundaVariableResolverModule,
    ],
    moddleExtensions: { camunda: camundaModdle as object },
    propertiesPanelDefaults: C7_PROPERTIES_PANEL_DEFAULTS,
};
