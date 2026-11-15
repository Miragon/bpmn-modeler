import { describe, expect, it } from "vitest";

import { mergeElement, mergeResult } from "./__fixtures__/mergeResultBuilder";
import { MergeDecisions } from "./mergeDecisions";
import { mergePaneSteps } from "./mergePaneSteps";

const decisions = () =>
    MergeDecisions.from(
        mergeResult(
            mergeElement("Process_1", "bothChanged", { type: "bpmn:Process" }),
            mergeElement("Task_Check", "unchanged"),
            mergeElement("Task_Pack", "bothChanged"),
            mergeElement("Task_Reject", "takenFromIncoming"),
            mergeElement("Task_Audit", "addedByIncoming"),
            mergeElement("End_Rejected", "removedAndChanged"),
        ),
    );

const ORDER = ["Task_Check", "End_Rejected", "Task_Reject", "Task_Pack", "Task_Audit", "Process_1"];

describe("mergePaneSteps", () => {
    it("walks the open conflicts in navigation order", () => {
        const steps = mergePaneSteps(decisions(), ORDER, "current");

        expect(steps.openConflicts.map(({ id }) => id)).toEqual([
            "End_Rejected",
            "Task_Pack",
            "Process_1",
        ]);
    });

    it("walks every element either pane marks, and leaves out the unchanged ones", () => {
        const steps = mergePaneSteps(decisions(), ORDER, "current");

        expect(steps.all.map(({ id }) => id)).toEqual([
            "End_Rejected",
            "Task_Reject",
            "Task_Pack",
            "Task_Audit",
            "Process_1",
        ]);
    });

    it("gives both panes the same steps, each knowing what its side holds and what has no shape", () => {
        const current = mergePaneSteps(decisions(), ORDER, "current");
        const incoming = mergePaneSteps(decisions(), ORDER, "incoming");

        expect(current.all.map(({ id }) => id)).toEqual(incoming.all.map(({ id }) => id));
        expect(current.openConflicts).toEqual([
            { id: "End_Rejected", shapeless: false, onThisPane: false },
            { id: "Task_Pack", shapeless: false, onThisPane: true },
            { id: "Process_1", shapeless: true, onThisPane: true },
        ]);
        expect(incoming.all.find(({ id }) => id === "Task_Audit")).toEqual({
            id: "Task_Audit",
            shapeless: false,
            onThisPane: true,
        });
        expect(current.all.find(({ id }) => id === "Task_Audit")?.onThisPane).toBe(false);
    });

    it("names the sub-process plane that draws a step, and none for the opening plane", () => {
        const withPlanes = MergeDecisions.from(
            mergeResult(
                mergeElement("Collaboration_1", "unchanged", { type: "bpmn:Collaboration" }),
                mergeElement("Process_1", "bothChanged", { type: "bpmn:Process", drawn: false }),
                mergeElement("Sub_Ship", "takenFromIncoming", {
                    type: "bpmn:SubProcess",
                    plane: "Collaboration_1",
                }),
                mergeElement("Task_Pack", "addedByIncoming", { plane: "Sub_Ship" }),
            ),
        );

        const steps = mergePaneSteps(withPlanes, ["Sub_Ship", "Task_Pack", "Process_1"], "current");

        expect(steps.all).toStrictEqual([
            { id: "Sub_Ship", shapeless: false, onThisPane: true },
            { id: "Task_Pack", shapeless: false, onThisPane: false, plane: "Sub_Ship" },
            { id: "Process_1", shapeless: true, onThisPane: true },
        ]);
    });
});
