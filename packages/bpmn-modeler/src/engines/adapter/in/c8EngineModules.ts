import zeebeModdle from "zeebe-bpmn-moddle/resources/zeebe.json";
import CamundaCloudBehaviorsModule from "camunda-bpmn-js-behaviors/lib/camunda-cloud";
import {
    BpmnPropertiesProviderModule,
    ZeebePropertiesProviderModule,
    ZeebeTooltipProvider,
} from "bpmn-js-properties-panel";
import { ZeebeVariableResolverModule } from "@bpmn-io/variable-resolver";
import ExampleDataPropertiesProviderModule from "@camunda/example-data-properties-provider";
import ColorPickerModule from "bpmn-js-color-picker";

import type { EngineModules } from "./engineModules";
import { UpstreamPropertiesPanelModule } from "./upstreamPanel";

const FEEL_POPUP_LINKS = {
    feel: {
        title: "Learn FEEL expressions",
        href: "https://docs.camunda.io/docs/components/modeler/feel/what-is-feel/",
    },
    feelers: {
        title: "Learn templating",
        href: "https://docs.camunda.io/docs/components/modeler/forms/configuration/forms-config-templating-syntax/",
    },
} as const;

export const C8_PROPERTIES_PANEL_DEFAULTS = {
    tooltip: ZeebeTooltipProvider,
    getFeelPopupLinks: (type: string) => {
        const link = FEEL_POPUP_LINKS[type as keyof typeof FEEL_POPUP_LINKS];
        return link ? [link] : undefined;
    },
};

export const c8EngineModules: EngineModules = {
    modules: [
        UpstreamPropertiesPanelModule,
        BpmnPropertiesProviderModule,
        CamundaCloudBehaviorsModule,
        ZeebePropertiesProviderModule,
        ColorPickerModule,
        ZeebeVariableResolverModule,
        ExampleDataPropertiesProviderModule,
    ],
    moddleExtensions: { zeebe: zeebeModdle as object },
    propertiesPanelDefaults: C8_PROPERTIES_PANEL_DEFAULTS,
};
