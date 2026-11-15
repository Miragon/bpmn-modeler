import { describe, expect, it } from "vitest";

import type { MergeSide } from "@miragon/bpmn-modeler-types";

import { mergePaneBasename, workingFileNameOfMergePane } from "./mergePaneName";

describe("mergePaneBasename", () => {
    it.each<[string, MergeSide, string]>([
        ["order.bpmn", "current", "order.current.bpmn"],
        ["order.bpmn", "incoming", "order.incoming.bpmn"],
        ["order.v2.bpmn", "current", "order.v2.current.bpmn"],
        ["order process.bpmn", "incoming", "order process.incoming.bpmn"],
        ["Order.BPMN", "current", "Order.current.BPMN"],
    ])("names the %s pane of %s %s", (fileName, side, expected) => {
        const paneName = mergePaneBasename(fileName, side);

        expect(paneName).toBe(expected);
        expect(paneName).not.toBe(fileName);
        expect(paneName.toLowerCase().endsWith(".bpmn")).toBe(true);
    });

    it.each<[string]>([["order.bpmn"], ["order.v2.bpmn"], ["order process.bpmn"]])(
        "reads %s back from either pane's name",
        (fileName) => {
            expect(workingFileNameOfMergePane(mergePaneBasename(fileName, "current"))).toBe(
                fileName,
            );
            expect(workingFileNameOfMergePane(mergePaneBasename(fileName, "incoming"))).toBe(
                fileName,
            );
        },
    );

    it("leaves a name that is no merge pane's as it is", () => {
        expect(workingFileNameOfMergePane("order.bpmn")).toBe("order.bpmn");
    });
});
