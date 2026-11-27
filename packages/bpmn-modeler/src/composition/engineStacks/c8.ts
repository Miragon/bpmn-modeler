import zeebeModdle from "zeebe-bpmn-moddle/resources/zeebe.json";
import ElementTemplateIconRendererModule from "@bpmn-io/element-template-icon-renderer";
import CamundaCloudBehaviorsModule from "camunda-bpmn-js-behaviors/lib/camunda-cloud";
import { ZeebePropertiesProviderModule } from "bpmn-js-properties-panel";
import { CloudElementTemplatesPropertiesProviderModule } from "bpmn-js-element-templates";
import { ZeebeVariableResolverModule } from "@bpmn-io/variable-resolver";
import ExampleDataPropertiesProviderModule from "@camunda/example-data-properties-provider";
import ColorPickerModule from "bpmn-js-color-picker";
import {
    CreateAppendAnythingModule,
    CreateAppendElementTemplatesModule,
} from "bpmn-js-create-append-anything";
import { composeUpstreamModules } from "./sharedModules";
import type { EngineStack } from "./engineStack";
import { C8_POPUP_MENU_ANNOTATIONS } from "../../engines/domain/popupMenuAnnotationOverrides";
import { C8_PROPERTIES_PANEL_DEFAULTS } from "../../engines/adapter/in/c8EngineModules";

export const c8Stack: EngineStack = {
    upstreamModules: composeUpstreamModules([
        ElementTemplateIconRendererModule,
        CamundaCloudBehaviorsModule,
        ZeebePropertiesProviderModule,
        CloudElementTemplatesPropertiesProviderModule,
        CreateAppendAnythingModule,
        CreateAppendElementTemplatesModule,
        ColorPickerModule,
        ZeebeVariableResolverModule,
        ExampleDataPropertiesProviderModule,
    ]),
    engineModules: [],
    moddleExtensions: { zeebe: zeebeModdle },
    propertiesPanelDefaults: C8_PROPERTIES_PANEL_DEFAULTS,
    popupMenuAnnotations: C8_POPUP_MENU_ANNOTATIONS,
};
