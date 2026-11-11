import type { ElementIdStyle } from "@miragon/bpmn-modeler-types";
import { describe, expect, it } from "vitest";

import { proposeIds, type IdCandidate, type IdProposal } from "./proposals";

const task = (id: string, name: string, type = "bpmn:Task"): IdCandidate => ({ id, name, type });

function propose(
    candidates: IdCandidate[],
    options: { style?: ElementIdStyle; unchecked?: string[]; takenElsewhere?: string[] } = {},
): IdProposal[] {
    const taken = new Set(options.takenElsewhere ?? []);
    return proposeIds(candidates, {
        style: options.style ?? "typePrefix",
        unchecked: new Set(options.unchecked ?? []),
        isTakenElsewhere: (id) => taken.has(id),
    });
}

const summary = (proposals: IdProposal[]) =>
    proposals.map((p) => [p.candidate.id, p.status, p.newId, p.clash]);

describe("proposeIds", () => {
    it("renames each named element after its name", () => {
        const proposals = propose([
            task("Activity_0x1y2z3", "Check stock"),
            task("Event_1p0o9i8", "Done", "bpmn:EndEvent"),
        ]);

        expect(summary(proposals)).toEqual([
            ["Activity_0x1y2z3", "rename", "Task_CheckStock", false],
            ["Event_1p0o9i8", "rename", "EndEvent_Done", false],
        ]);
    });

    it("renames an ID that spells another type, as after a task became a service task", () => {
        const proposals = propose([
            task("Activity_CheckOrder", "Check order", "bpmn:ServiceTask"),
            task("Task_ShipOrder", "Ship order", "bpmn:ServiceTask"),
        ]);

        expect(summary(proposals)).toEqual([
            ["Activity_CheckOrder", "rename", "ServiceTask_CheckOrder", false],
            ["Task_ShipOrder", "rename", "ServiceTask_ShipOrder", false],
        ]);
    });

    it("numbers the second element with the same name", () => {
        const proposals = propose([
            task("Activity_a", "Notify customer"),
            task("Activity_b", "Notify customer"),
        ]);

        expect(summary(proposals)).toEqual([
            ["Activity_a", "rename", "Task_NotifyCustomer", false],
            ["Activity_b", "rename", "Task_NotifyCustomer_2", true],
        ]);
    });

    it.each<[ElementIdStyle, string]>([
        ["typePrefix", "Task_Notify_2"],
        ["snakeCase", "task_notify_2"],
        ["typeSuffix", "NotifyTask2"],
    ])("counts a clash the %s way", (style, second) => {
        const proposals = propose([task("a1", "Notify"), task("a2", "Notify")], { style });

        expect(proposals[1]?.newId).toBe(second);
    });

    it("leaves an element whose ID already follows its name, and keeps that ID for it", () => {
        const proposals = propose([
            task("Activity_x", "Ship order"),
            task("Task_ShipOrder", "Ship order"),
        ]);

        expect(summary(proposals)).toEqual([
            ["Activity_x", "rename", "Task_ShipOrder_2", true],
            ["Task_ShipOrder", "matches", "Task_ShipOrder", false],
        ]);
    });

    it("counts an ID with a counter as following its name, so a second run changes nothing", () => {
        const first = propose([task("a", "Notify"), task("b", "Notify")]);
        const renamed = first.map((p) => task(p.newId ?? p.candidate.id, p.candidate.name));

        expect(propose(renamed).map((p) => p.status)).toEqual(["matches", "matches"]);
    });

    it("never proposes an ID another element outside the review holds", () => {
        const proposals = propose([task("a", "Check")], {
            takenElsewhere: ["Task_Check", "Task_Check_2"],
        });

        expect(proposals[0]?.newId).toBe("Task_Check_3");
    });

    it("lets an element take an ID that another renamed element gives up", () => {
        const proposals = propose([task("Task_B", "A"), task("Task_A", "B")]);

        expect(summary(proposals)).toEqual([
            ["Task_B", "rename", "Task_A", false],
            ["Task_A", "rename", "Task_B", false],
        ]);
    });

    it("keeps the ID of an unchecked element and steers the others around it", () => {
        const proposals = propose([task("Task_Check", "Ship"), task("b", "Check")], {
            unchecked: ["Task_Check"],
        });

        expect(summary(proposals)).toEqual([
            ["Task_Check", "unchecked", "Task_Ship", false],
            ["b", "rename", "Task_Check_2", true],
        ]);
    });

    it("skips an element whose name yields no ID", () => {
        const proposals = propose([task("a", ""), task("b", "???")]);

        expect(summary(proposals)).toEqual([
            ["a", "skipped", undefined, false],
            ["b", "skipped", undefined, false],
        ]);
    });

    it("spells IDs in the requested style", () => {
        const proposals = propose([task("a", "Process data", "bpmn:UserTask")], {
            style: "typeSuffix",
        });

        expect(proposals[0]?.newId).toBe("ProcessDataTask");
    });
});
