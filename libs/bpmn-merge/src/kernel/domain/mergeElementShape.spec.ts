import { describe, expect, it } from "vitest";

import { mergeElement } from "../../__fixtures__/mergeResultBuilder";
import { hasNoShape, onOnePlane } from "./mergeElementShape";
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

describe("onOnePlane", () => {
    const typesInResult: Record<string, string> = {
        Collaboration_1: "bpmn:Collaboration",
        Process_1: "bpmn:Process",
        Sub_1: "bpmn:SubProcess",
        Sub_2: "bpmn:SubProcess",
    };
    const typeInResult = (id: string): string | undefined => typesInResult[id];

    it.each([
        ["the same root plane", "Process_1", "Process_1", true],
        ["a collaboration's and a process's root plane", "Collaboration_1", "Process_1", true],
        [
            "a process's root plane and a collaboration the result drops",
            "Process_1",
            "Collab_X",
            false,
        ],
        ["the same sub-process plane", "Sub_1", "Sub_1", true],
        ["two sub-process planes", "Sub_1", "Sub_2", false],
        ["a root plane and a sub-process plane", "Process_1", "Sub_1", false],
        ["a plane and none", "Process_1", undefined, false],
        ["no plane on either side", undefined, undefined, true],
    ])("%s → %s", (_name, first, second, expected) => {
        expect(onOnePlane(first, second, typeInResult)).toBe(expected);
        expect(onOnePlane(second, first, typeInResult)).toBe(expected);
    });
});
