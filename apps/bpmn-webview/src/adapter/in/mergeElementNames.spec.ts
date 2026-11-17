import { describe, expect, it } from "vitest";

import { createMergeElementNamesModule, MergeElementNames } from "./mergeElementNames";

interface Element {
    readonly id: string;
    readonly businessObject?: { name?: unknown };
    readonly waypoints?: readonly object[];
    readonly source?: Element;
    readonly target?: Element;
}

const untranslated = (key: string, replacements: Record<string, string> = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

function names(elements: Record<string, Element>) {
    let attached: MergeElementNames | undefined;
    new MergeElementNames({ get: (id) => elements[id] }, untranslated, {
        attach: (found) => (attached = found),
    });
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
            Task_Named: { id: "Task_Named", businessObject: { name: "Pack parcel" } },
            Task_Blank: { id: "Task_Blank", businessObject: { name: "  " } },
            Task_Unnamed: { id: "Task_Unnamed", businessObject: {} },
        });

        expect(lookup.nameOf(id)).toBe(name);
    });

    it("names an unnamed flow this canvas draws by its ends, and a named one by its name", () => {
        const timer = { id: "Start_Received", businessObject: { name: "Order received" } };
        const gateway = { id: "Gateway_1", businessObject: {} };
        const lookup = names({
            Flow_1: {
                id: "Flow_1",
                businessObject: {},
                waypoints: [],
                source: timer,
                target: gateway,
            },
            Flow_Yes: {
                id: "Flow_Yes",
                businessObject: { name: "yes" },
                waypoints: [],
                source: gateway,
                target: timer,
            },
        });

        expect(lookup.nameOf("Flow_1")).toBe("Flow from Order received to Gateway_1");
        expect(lookup.nameOf("Flow_Yes")).toBe("yes");
    });

    it("hands itself to the pane that adds the module", () => {
        const module = createMergeElementNamesModule({ attach: () => undefined });

        expect(module.__init__).toEqual(["mergeElementNames"]);
        expect(module.mergeElementNames).toEqual(["type", MergeElementNames]);
    });
});
