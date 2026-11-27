import { describe, expect, it, vi } from "vitest";
import { getLatestVersion, initialDiagram } from "@miragon/bpmn-modeler-types";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";
import type { DiagramTemplate } from "../../../kernel/port/kernelServices";
import {
    C7_POPUP_MENU_ANNOTATIONS,
    C8_POPUP_MENU_ANNOTATIONS,
} from "../../domain/popupMenuAnnotationOverrides";

const loaded = vi.hoisted(() => ({ c7: vi.fn(), c8: vi.fn() }));
const C7_MODULE = { c7Probe: ["value", 7] };
const C8_MODULE = { c8Probe: ["value", 8] };

vi.mock("./c7EngineModules", () => {
    loaded.c7();
    return {
        c7EngineModules: {
            modules: [{ c7Probe: ["value", 7] }],
            moddleExtensions: { camunda: { prefix: "camunda" } },
            propertiesPanelDefaults: { tooltip: "c7 tooltip" },
        },
    };
});
vi.mock("./c8EngineModules", () => {
    loaded.c8();
    return {
        c8EngineModules: {
            modules: [{ c8Probe: ["value", 8] }],
            moddleExtensions: { zeebe: { prefix: "zeebe" } },
            propertiesPanelDefaults: { tooltip: "c8 tooltip" },
        },
    };
});

import { camunda7, camunda8 } from "./engineFeatures";

function slotValue<T>(feature: BpmnFeature, name: string): T {
    const module = feature.modules.find(
        (candidate) => typeof candidate === "object" && candidate !== null && name in candidate,
    ) as Record<string, [string, T]>;
    return module[name][1];
}

describe("the engine features", () => {
    it("loads only Camunda 7's modules and appends its slots", async () => {
        const feature = await camunda7();

        expect(loaded.c7).toHaveBeenCalledOnce();
        expect(loaded.c8).not.toHaveBeenCalled();
        expect(feature).toEqual({
            id: "camunda7",
            modules: [
                C7_MODULE,
                { diagramTemplate: ["value", expect.anything()] },
                { popupMenuAnnotationOverrides: ["value", C7_POPUP_MENU_ANNOTATIONS] },
            ],
            moddleExtensions: { camunda: { prefix: "camunda" } },
            config: { propertiesPanel: { tooltip: "c7 tooltip" } },
        });
    });

    it("gives Camunda 8 its own modules, moddle, panel defaults and overrides", async () => {
        const feature = await camunda8();

        expect(feature).toEqual({
            id: "camunda8",
            modules: [
                C8_MODULE,
                { diagramTemplate: ["value", expect.anything()] },
                { popupMenuAnnotationOverrides: ["value", C8_POPUP_MENU_ANNOTATIONS] },
            ],
            moddleExtensions: { zeebe: { prefix: "zeebe" } },
            config: { propertiesPanel: { tooltip: "c8 tooltip" } },
        });
    });

    it("opens a new diagram stamped with the engine's latest version", async () => {
        const template = slotValue<DiagramTemplate>(await camunda8(), "diagramTemplate");

        expect(template.newDiagramXml()).toBe(initialDiagram("c8", getLatestVersion("c8")));
    });

    it("stamps the version it is given instead", async () => {
        const template = slotValue<DiagramTemplate>(
            await camunda7({ engineVersion: "7.21.0" }),
            "diagramTemplate",
        );

        expect(template.newDiagramXml()).toBe(initialDiagram("c7", "7.21.0"));
    });
});
