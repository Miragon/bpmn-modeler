import { describe, expect, it } from "vitest";

import { mergeElement } from "./__fixtures__/mergeResultBuilder";
import { hasNoShape } from "./mergeElementShape";
import type { MergeElement } from "./mergeResult";

describe("hasNoShape", () => {
    it.each<[string, MergeElement, boolean]>([
        [
            "the process's own attributes, although its plane counts as drawn",
            mergeElement("Process_1", "bothChanged", { type: "bpmn:Process", drawn: true }),
            true,
        ],
        [
            "a collaboration",
            mergeElement("Collaboration_1", "bothChanged", {
                type: "bpmn:Collaboration",
                drawn: true,
            }),
            true,
        ],
        [
            "a process inside a pool",
            mergeElement("Process_1", "takenFromIncoming", { type: "bpmn:Process", drawn: false }),
            true,
        ],
        [
            "a message",
            mergeElement("Message_Order", "bothChanged", { type: "bpmn:Message", drawn: false }),
            true,
        ],
        [
            "an error",
            mergeElement("Error_Stock", "differs", { type: "bpmn:Error", drawn: false }),
            true,
        ],
        [
            "a child of a collapsed sub-process, drawn on its plane",
            mergeElement("Task_Pack", "bothChanged", { drawn: true, plane: "Sub_Ship" }),
            false,
        ],
        ["a task", mergeElement("Task_Check", "bothChanged"), false],
        [
            "an element only one side draws",
            mergeElement("Task_Check", "bothChanged", {
                current: { drawn: false },
                incoming: { drawn: true },
            }),
            false,
        ],
    ])("%s → %s", (_name, element, expected) => {
        expect(hasNoShape(element)).toBe(expected);
    });
});
