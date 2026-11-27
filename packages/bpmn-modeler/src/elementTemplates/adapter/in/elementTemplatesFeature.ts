import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";
import { type Engine, isEngine, UnsupportedEngineError } from "@miragon/bpmn-modeler-types";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";
import {
    BPMN_TAB,
    ElementTemplateEngineRefreshModule,
    ElementTemplateOfferModule,
    PopupMenuModeFilterModule,
    ReplaceTemplatesTabModule,
} from "./elementTemplatesModules";
import type { EngineTemplateModules } from "./engineTemplateModules";

const TEMPLATE_MODULE_LOADERS: Record<Engine, () => Promise<EngineTemplateModules>> = {
    c7: async () => (await import("./c7TemplateModules")).c7TemplateModules,
    c8: async () => (await import("./c8TemplateModules")).c8TemplateModules,
};

/**
 * @experimental Element templates for one engine: its template providers and
 * menus, the chooser, the offer that hides templates, the Templates tab and the
 * mode filter. Needs an engine feature, whose upstream panel the providers render in.
 */
export async function elementTemplates(engine: Engine): Promise<BpmnFeature> {
    if (!isEngine(engine)) {
        throw new UnsupportedEngineError(engine);
    }
    const { leading, trailing } = await TEMPLATE_MODULE_LOADERS[engine]();
    return {
        id: "elementTemplates",
        modules: [
            ...leading,
            ElementTemplateChooserModule,
            ReplaceTemplatesTabModule,
            // Before the offer's hidden-template filter, which shares its priority.
            PopupMenuModeFilterModule,
            ElementTemplateOfferModule,
            ElementTemplateEngineRefreshModule,
            ...trailing,
        ],
        config: { popupMenu: { defaultTab: BPMN_TAB } },
        // The forked panel provides `propertiesPanel` too, but never `bpmnPropertiesProvider`.
        requires: ["propertiesPanel", "bpmnPropertiesProvider"],
    };
}
