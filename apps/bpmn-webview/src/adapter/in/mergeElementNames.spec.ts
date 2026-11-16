import { describe, expect, it } from "vitest";

import { createMergeElementNamesModule, MergeElementNames } from "./mergeElementNames";

function names(elements: Record<string, object>) {
    let attached: MergeElementNames | undefined;
    new MergeElementNames(
        { get: (id) => elements[id] as never },
        { attach: (found) => (attached = found) },
    );
    return attached as MergeElementNames;
}

describe("MergeElementNames", () => {
    it.each<[string, string | undefined]>([
        ["Task_Named", "Pack parcel"],
        ["Task_Blank", undefined],
        ["Task_Unnamed", undefined],
        ["Task_OnlyIncoming", undefined],
    ])("names %s as %s", (id, name) => {
        const lookup = names({
            Task_Named: { businessObject: { name: "Pack parcel" } },
            Task_Blank: { businessObject: { name: "  " } },
            Task_Unnamed: { businessObject: {} },
        });

        expect(lookup.nameOf(id)).toBe(name);
    });

    it("names a connection's ends by their BPMN ids, and nothing for a shape", () => {
        const lookup = names({
            Flow_1: {
                businessObject: { id: "Flow_1" },
                source: { businessObject: { id: "Event_Start" } },
                target: { businessObject: { id: "Task_Pack" } },
            },
            Task_Pack: { businessObject: { id: "Task_Pack" } },
        });

        expect(lookup.flowEndsOf("Flow_1")).toStrictEqual({
            source: "Event_Start",
            target: "Task_Pack",
        });
        expect(lookup.flowEndsOf("Task_Pack")).toBeUndefined();
        expect(lookup.flowEndsOf("Flow_Gone")).toBeUndefined();
    });

    it("hands itself to the pane that adds the module", () => {
        const module = createMergeElementNamesModule({ attach: () => undefined });

        expect(module.__init__).toEqual(["mergeElementNames"]);
        expect(module.mergeElementNames).toEqual(["type", MergeElementNames]);
    });
});
