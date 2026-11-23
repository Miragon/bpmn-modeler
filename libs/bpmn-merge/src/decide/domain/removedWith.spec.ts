import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult, refersTo } from "../../__fixtures__/mergeResultBuilder";
import { restoredWithoutRemovedWithNotes } from "../../build/domain/buildNotes";
import type { MergeResolution } from "./mergeDecisions";
import type { ElementState, MergeSide } from "../../kernel/domain/mergeResult";
import { connectionsRemovedWith, keptAgainstRemoval } from "./removedWith";

const process = mergeElement("Process", "unchanged", { type: "bpmn:Process" });

const sequenceFlow = (id: string, source: string, target: string, state: ElementState) =>
    mergeElement(id, state, {
        type: "bpmn:SequenceFlow",
        parent: "Process",
        references: [
            refersTo("bpmn:SequenceFlow#sourceRef", source),
            refersTo("bpmn:SequenceFlow#targetRef", target),
        ],
    });

/** Current removed the task with its two flows; incoming added a third flow from it. */
const result = mergeResult(
    process,
    mergeElement("Gateway", "unchanged", { parent: "Process" }),
    mergeElement("End", "unchanged", { parent: "Process" }),
    mergeElement("Task", "removedByCurrent", { parent: "Process" }),
    sequenceFlow("Flow_In", "Gateway", "Task", "removedByCurrent"),
    sequenceFlow("Flow_Out", "Task", "End", "removedByCurrent"),
    sequenceFlow("Flow_Added", "Task", "End", "addedByIncoming"),
    sequenceFlow("Flow_Other", "Gateway", "End", "unchanged"),
);
const task = result.elements.find(({ id }) => id === "Task")!;

describe("removedWith", () => {
    it.each<[ElementState, MergeSide, boolean]>([
        ["removedByCurrent", "incoming", true],
        ["removedByCurrent", "current", false],
        ["takenFromIncoming", "incoming", false],
        ["addedByIncoming", "incoming", false],
    ])("counts a %s element kept on %s as kept against removal: %s", (state, side, kept) => {
        expect(keptAgainstRemoval(mergeElement("E", state), side)).toBe(kept);
    });

    it("lists the flows the removing side removed with the element, not one the keeping side added", () => {
        expect(
            connectionsRemovedWith(result.elements, task, "incoming").map(({ id }) => id),
        ).toEqual(["Flow_In", "Flow_Out"]);
    });

    it("lists nothing on the removing side", () => {
        expect(connectionsRemovedWith(result.elements, task, "current")).toEqual([]);
    });

    it("names only the connections pickWithRemoved left out", () => {
        const resolution = (kept: readonly string[]): MergeResolution => ({
            elements: Object.fromEntries(
                result.elements.map(({ id, state }) => [
                    id,
                    kept.includes(id) || state === "addedByIncoming" ? "incoming" : "current",
                ]),
            ),
            layout: {},
            appendedLanes: [],
        });

        expect(restoredWithoutRemovedWithNotes(result, resolution(["Task", "Flow_In"]))).toEqual([
            { kind: "restoredWithoutRemovedWith", id: "Task", connections: ["Flow_Out"] },
        ]);
        expect(
            restoredWithoutRemovedWithNotes(result, resolution(["Task", "Flow_In", "Flow_Out"])),
        ).toEqual([]);
    });
});
