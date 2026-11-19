import { describe, expect, it } from "vitest";

import { mergeElementLabel, type MergeElementNaming } from "./mergeElementLabel";
import type { MergeTranslate } from "./mergeTranslate";

const untranslated: MergeTranslate = (key, replacements = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

const timer: MergeElementNaming = { id: "Start_Received", name: "Order received" };
const task: MergeElementNaming = { id: "Task_Remind", name: "Send invoice" };

describe("mergeElementLabel", () => {
    it.each<[string, MergeElementNaming, string]>([
        ["an element by its name", task, "Send invoice"],
        ["an element without a name by its id", { id: "Error_1" }, "Error_1"],
        ["an element with a blank name by its id", { id: "Task_1", name: "  " }, "Task_1"],
        [
            "an unnamed flow by the names of its ends",
            { id: "Flow_1", flowEnds: { source: timer, target: task } },
            "Flow from Order received to Send invoice",
        ],
        [
            "an unnamed flow's unnamed end by its id",
            { id: "Flow_1", flowEnds: { source: { id: "Gateway_1" }, target: task } },
            "Flow from Gateway_1 to Send invoice",
        ],
        [
            "a flow with a blank name by its ends",
            { id: "Flow_1", name: " ", flowEnds: { source: timer, target: task } },
            "Flow from Order received to Send invoice",
        ],
        [
            "a named flow by its name",
            { id: "Flow_1", name: "yes", flowEnds: { source: timer, target: task } },
            "yes",
        ],
    ])("names %s", (_case, element, label) => {
        expect(mergeElementLabel(element, untranslated)).toBe(label);
    });

    it("translates the flow's words, not the names of its ends", () => {
        const german: MergeTranslate = (key, replacements = {}) =>
            key === "Flow from {source} to {target}"
                ? `Fluss von ${replacements.source} nach ${replacements.target}`
                : key;

        expect(
            mergeElementLabel({ id: "Flow_1", flowEnds: { source: timer, target: task } }, german),
        ).toBe("Fluss von Order received nach Send invoice");
    });
});
