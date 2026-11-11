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
            ["Activity_0x1y2z3", "rename", "Activity_CheckStock", false],
            ["Event_1p0o9i8", "rename", "Event_Done", false],
        ]);
    });

    it("numbers the second element with the same name", () => {
        const proposals = propose([
            task("Activity_a", "Notify customer"),
            task("Activity_b", "Notify customer"),
        ]);

        expect(summary(proposals)).toEqual([
            ["Activity_a", "rename", "Activity_NotifyCustomer", false],
            ["Activity_b", "rename", "Activity_NotifyCustomer_2", true],
        ]);
    });

    it.each<[ElementIdStyle, string]>([
        ["typePrefix", "Activity_Notify_2"],
        ["snakeCase", "activity_notify_2"],
        ["typeSuffix", "NotifyTask2"],
    ])("counts a clash the %s way", (style, second) => {
        const proposals = propose([task("a1", "Notify"), task("a2", "Notify")], { style });

        expect(proposals[1]?.newId).toBe(second);
    });

    it("leaves an element whose ID already follows its name, and keeps that ID for it", () => {
        const proposals = propose([
            task("Activity_x", "Ship order"),
            task("Activity_ShipOrder", "Ship order"),
        ]);

        expect(summary(proposals)).toEqual([
            ["Activity_x", "rename", "Activity_ShipOrder_2", true],
            ["Activity_ShipOrder", "matches", "Activity_ShipOrder", false],
        ]);
    });

    it("counts an ID with a counter as following its name, so a second run changes nothing", () => {
        const first = propose([task("a", "Notify"), task("b", "Notify")]);
        const renamed = first.map((p) => task(p.newId ?? p.candidate.id, p.candidate.name));

        expect(propose(renamed).map((p) => p.status)).toEqual(["matches", "matches"]);
    });

    it("never proposes an ID another element outside the review holds", () => {
        const proposals = propose([task("a", "Check")], {
            takenElsewhere: ["Activity_Check", "Activity_Check_2"],
        });

        expect(proposals[0]?.newId).toBe("Activity_Check_3");
    });

    it("lets an element take an ID that another renamed element gives up", () => {
        const proposals = propose([task("Activity_B", "A"), task("Activity_A", "B")]);

        expect(summary(proposals)).toEqual([
            ["Activity_B", "rename", "Activity_A", false],
            ["Activity_A", "rename", "Activity_B", false],
        ]);
    });

    it("keeps the ID of an unchecked element and steers the others around it", () => {
        const proposals = propose([task("Activity_Check", "Ship"), task("b", "Check")], {
            unchecked: ["Activity_Check"],
        });

        expect(summary(proposals)).toEqual([
            ["Activity_Check", "unchecked", "Activity_Ship", false],
            ["b", "rename", "Activity_Check_2", true],
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
