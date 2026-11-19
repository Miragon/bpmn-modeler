import { describe, expect, it } from "vitest";

import { baseModel, nodeById } from "./__fixtures__/baseModel";
import { type BpmnFixtureModel, renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { layoutModelOf } from "./layoutModelReader";

async function layoutOf(edit: (model: BpmnFixtureModel) => void) {
    const model = baseModel("c8");
    edit(model);
    return layoutModelOf((await parseWithoutWarnings(renderBpmn(model))).rootElement);
}

function collapseShipping(model: BpmnFixtureModel): void {
    Object.assign(nodeById(model, "Sub_Ship"), { collapsed: true, width: 100, height: 80 });
}

describe("layoutModelOf", () => {
    it.each([
        { label: "a collaboration's plane", edit: () => {}, plane: "Collaboration_1" },
        {
            label: "a process's plane",
            edit: (model: BpmnFixtureModel) => {
                model.pools = [];
                model.flows = model.flows.filter((flow) => flow.kind !== "message");
            },
            plane: "Process_1",
        },
        {
            label: "the plane a collapsed sub-process lies on",
            edit: collapseShipping,
            plane: "Collaboration_1",
        },
    ])("reads $label as a root plane", async ({ edit, plane }) => {
        const layout = await layoutOf(edit);

        expect(layout.shapes.get("Sub_Ship")).toMatchObject({ plane, planeKind: "root" });
    });

    it("reads a collapsed sub-process's own plane as a sub-process plane", async () => {
        const layout = await layoutOf(collapseShipping);

        expect(layout.shapes.get("Task_Pack")).toMatchObject({
            plane: "Sub_Ship",
            planeKind: "subProcess",
        });
    });
});
