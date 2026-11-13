import { afterEach, describe, expect, it } from "vitest";

import { createModeler } from "./createModeler";
import { decisionXml } from "./diff/__fixtures__/diffXml";
import type { DmnModelerHandle } from "./publicApi";

const modelers: DmnModelerHandle[] = [];
const mounts: HTMLElement[] = [];

async function modelerWithDecisionTableOpen(): Promise<DmnModelerHandle> {
    const container = document.createElement("div");
    container.style.cssText = "position: relative; width: 800px; height: 500px;";
    const panelParent = document.createElement("div");
    document.body.append(container, panelParent);
    mounts.push(container, panelParent);
    const modeler = await createModeler(container, { propertiesPanel: { parent: panelParent } });
    modelers.push(modeler);
    await modeler.loadDiagram(decisionXml());
    const table = modeler.getViews().find((view) => view.id === "Decision_1")!;
    await modeler.openView(table);
    return modeler;
}

const activeView = (modeler: DmnModelerHandle) => {
    const view = modeler.getActiveView();
    return view && { type: view.type, id: view.id };
};

afterEach(() => {
    modelers.splice(0).forEach((modeler) => modeler.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
});

describe("a re-import of the DMN modeler (real dmn-js)", () => {
    it("keeps the open decision table while the text still holds its decision", async () => {
        const modeler = await modelerWithDecisionTableOpen();

        await modeler.loadDiagram(decisionXml(["R1", "R2"]));

        expect(activeView(modeler)).toEqual({ type: "decisionTable", id: "Decision_1" });
    });

    it("opens the decision requirements diagram once the text no longer holds the decision", async () => {
        const modeler = await modelerWithDecisionTableOpen();

        await modeler.loadDiagram(decisionXml().replaceAll("Decision_1", "Decision_Renamed"));

        expect(activeView(modeler)).toEqual({ type: "drd", id: "Definitions_1" });
    });
});
