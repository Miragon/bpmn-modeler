import { describe, expect, it } from "vitest";

import type { MergeSide } from "@miragon/bpmn-modeler-types/domain";

import { mergePaneBasename } from "./mergePaneName";

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

    it.each<[string, string]>([
        ["order", "order.current"],
        [".bpmn", ".current.bpmn"],
    ])("names the current pane of %s %s", (fileName, expected) => {
        expect(mergePaneBasename(fileName, "current")).toBe(expected);
    });
});
