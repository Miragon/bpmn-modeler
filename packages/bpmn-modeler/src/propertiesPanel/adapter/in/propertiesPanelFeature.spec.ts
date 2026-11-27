import { describe, expect, it } from "vitest";
import { CustomGroupsModule } from "@miragon/bpmn-modeler-properties-panel/customGroups/CustomGroupsRegistry";
import { ModeFilterModule } from "@miragon/bpmn-modeler-properties-panel/modeFilter/ModeFilterProvider";

import { propertiesPanel } from "./propertiesPanelFeature";

describe("propertiesPanel", () => {
    const parent = document.createElement("div");
    const feelPopupContainer = document.createElement("div");

    it("registers the panel root, the mode filter and the custom groups for any panel", () => {
        expect(propertiesPanel({ parent })).toMatchObject({
            id: "propertiesPanel",
            modules: [
                { propertiesPanelRoot: ["value", parent] },
                ModeFilterModule,
                CustomGroupsModule,
            ],
            requires: ["propertiesPanel"],
        });
    });

    it("hands the panel its parent, the FEEL popup container and the mode", () => {
        expect(propertiesPanel({ parent, feelPopupContainer, mode: "design" }).config).toEqual({
            propertiesPanel: { parent, feelPopupContainer },
            propertiesPanelMode: "design",
        });
    });
});
