import { describe, expect, it } from "vitest";

import { createMergeElementNamesModule, MergeElementNames } from "./mergeElementNames";

function names(elements: Record<string, { businessObject?: { name?: unknown } }>) {
    let attached: MergeElementNames | undefined;
    new MergeElementNames({ get: (id) => elements[id] }, { attach: (found) => (attached = found) });
    return attached as MergeElementNames;
}

describe("MergeElementNames", () => {
    it.each<[string, string]>([
        ["Task_Named", "Pack parcel"],
        ["Task_Blank", "Task_Blank"],
        ["Task_Unnamed", "Task_Unnamed"],
        ["Task_OnlyIncoming", "Task_OnlyIncoming"],
    ])("names %s as %s", (id, name) => {
        const lookup = names({
            Task_Named: { businessObject: { name: "Pack parcel" } },
            Task_Blank: { businessObject: { name: "  " } },
            Task_Unnamed: { businessObject: {} },
        });

        expect(lookup.nameOf(id)).toBe(name);
    });

    it("hands itself to the pane that adds the module", () => {
        const module = createMergeElementNamesModule({ attach: () => undefined });

        expect(module.__init__).toEqual(["mergeElementNames"]);
        expect(module.mergeElementNames).toEqual(["type", MergeElementNames]);
    });
});
