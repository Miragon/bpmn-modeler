import { describe, expect, it, vi } from "vitest";
import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";
import { type Engine, UnsupportedEngineError } from "@miragon/bpmn-modeler-types";

import {
    BPMN_TAB,
    ElementTemplateEngineRefreshModule,
    ElementTemplateOfferModule,
    PopupMenuModeFilterModule,
    ReplaceTemplatesTabModule,
} from "./elementTemplatesModules";

const loaded = vi.hoisted(() => ({ c7: vi.fn(), c8: vi.fn() }));

vi.mock("./c7TemplateModules", () => {
    loaded.c7();
    return { c7TemplateModules: { leading: ["c7 leading"], trailing: ["c7 trailing"] } };
});
vi.mock("./c8TemplateModules", () => {
    loaded.c8();
    return { c8TemplateModules: { leading: ["c8 leading"], trailing: [] } };
});

import { elementTemplates } from "./elementTemplatesFeature";

const SHARED_MODULES = [
    ElementTemplateChooserModule,
    ReplaceTemplatesTabModule,
    PopupMenuModeFilterModule,
    ElementTemplateOfferModule,
    ElementTemplateEngineRefreshModule,
];

describe("elementTemplates", () => {
    it("rejects an unknown engine without loading any template modules", async () => {
        await expect(elementTemplates("c9" as Engine)).rejects.toThrow(UnsupportedEngineError);
        expect(loaded.c7).not.toHaveBeenCalled();
        expect(loaded.c8).not.toHaveBeenCalled();
    });

    it("places the engine's template modules around the shared ones, loading only that engine's", async () => {
        const feature = await elementTemplates("c7");

        expect(feature.modules).toEqual(["c7 leading", ...SHARED_MODULES, "c7 trailing"]);
        expect(loaded.c7).toHaveBeenCalledOnce();
        expect(loaded.c8).not.toHaveBeenCalled();
    });

    it("opens the replace menu on the BPMN tab and requires the upstream panel", async () => {
        const feature = await elementTemplates("c8");

        expect(feature).toMatchObject({
            id: "elementTemplates",
            modules: ["c8 leading", ...SHARED_MODULES],
            config: { popupMenu: { defaultTab: BPMN_TAB } },
            requires: ["propertiesPanel", "bpmnPropertiesProvider"],
        });
    });
});
