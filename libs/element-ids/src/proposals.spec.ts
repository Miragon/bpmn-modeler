import { naming } from "@miragon/bpmnlint-plugin-rules";
import { describe, expect, it } from "vitest";

import type { IdConvention } from "./convention";
import { bpmn as moddle } from "./__fixtures__/moddle";
import { proposeIds, type IdCandidate, type IdProposal } from "./proposals";

const miragon = new naming.ElementIdConvention();

const task = (id: string, name: string, type = "bpmn:Task"): IdCandidate => ({
    id,
    name,
    type,
    element: moddle.create(type, { id, name }),
});

function propose(
    candidates: IdCandidate[],
    options: { convention?: IdConvention; unchecked?: string[]; takenElsewhere?: string[] } = {},
): IdProposal[] {
    const taken = new Set(options.takenElsewhere ?? []);
    return proposeIds(candidates, {
        convention: options.convention ?? miragon,
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
            ["Activity_0x1y2z3", "rename", "task_checkStock", false],
            ["Event_1p0o9i8", "rename", "endEvent_done", false],
        ]);
    });

    it("renames an ID that spells another type, as after a task became a service task", () => {
        const proposals = propose([
            task("Activity_CheckOrder", "Check order", "bpmn:ServiceTask"),
            task("task_shipOrder", "Ship order", "bpmn:ServiceTask"),
        ]);

        expect(summary(proposals)).toEqual([
            ["Activity_CheckOrder", "rename", "serviceTask_checkOrder", false],
            ["task_shipOrder", "rename", "serviceTask_shipOrder", false],
        ]);
    });

    it("numbers the second element with the same name inside the case", () => {
        const proposals = propose([
            task("Activity_a", "Notify customer"),
            task("Activity_b", "Notify customer"),
        ]);

        expect(summary(proposals)).toEqual([
            ["Activity_a", "rename", "task_notifyCustomer", false],
            ["Activity_b", "rename", "task_notifyCustomer2", true],
        ]);
    });

    it.each<[string, string]>([
        ["camelCase", "task_notify2"],
        ["PascalCase", "task_Notify2"],
        ["snake_case", "task_notify_2"],
        ["kebab-case", "task_notify-2"],
    ])("counts a clash in %s so the ID still follows the rule", (namingCase, second) => {
        const convention = new naming.ElementIdConvention({ case: namingCase });
        const proposals = propose([task("a1", "Notify"), task("a2", "Notify")], { convention });

        expect(proposals[1]?.newId).toBe(second);
    });

    it("leaves an element whose ID already follows its name, and keeps that ID for it", () => {
        const proposals = propose([
            task("Activity_x", "Ship order"),
            task("task_shipOrder", "Ship order"),
        ]);

        expect(summary(proposals)).toEqual([
            ["Activity_x", "rename", "task_shipOrder2", true],
            ["task_shipOrder", "matches", "task_shipOrder", false],
        ]);
    });

    it("counts an ID with an event qualifier the rule accepts as following its name", () => {
        const start = moddle.create("bpmn:StartEvent", {
            id: "messageStartEvent_orderReceived",
            name: "Order received",
            eventDefinitions: [moddle.create("bpmn:MessageEventDefinition")],
        });
        const candidate = {
            id: "messageStartEvent_orderReceived",
            name: "Order received",
            type: start.$type,
            element: start,
        };

        expect(propose([candidate])[0]?.status).toBe("matches");
    });

    it("counts an ID with a counter as following its name, so a second run changes nothing", () => {
        const first = propose([task("a", "Notify"), task("b", "Notify")]);
        const renamed = first.map((p) => task(p.newId ?? p.candidate.id, p.candidate.name));

        expect(propose(renamed).map((p) => p.status)).toEqual(["matches", "matches"]);
    });

    it("never proposes an ID another element outside the review holds", () => {
        const proposals = propose([task("a", "Check")], {
            takenElsewhere: ["task_check", "task_check2"],
        });

        expect(proposals[0]?.newId).toBe("task_check3");
    });

    it("lets an element take an ID that another renamed element gives up", () => {
        const proposals = propose([task("task_b", "A"), task("task_a", "B")]);

        expect(summary(proposals)).toEqual([
            ["task_b", "rename", "task_a", false],
            ["task_a", "rename", "task_b", false],
        ]);
    });

    it("keeps the ID of an unchecked element and steers the others around it", () => {
        const proposals = propose([task("task_check", "Ship"), task("b", "Check")], {
            unchecked: ["task_check"],
        });

        expect(summary(proposals)).toEqual([
            ["task_check", "unchecked", "task_ship", false],
            ["b", "rename", "task_check2", true],
        ]);
    });

    it("never proposes the ID an element without a name keeps", () => {
        const proposals = propose([
            task("flow_yes", "", "bpmn:SequenceFlow"),
            task("Flow_1", "Yes", "bpmn:SequenceFlow"),
        ]);

        expect(summary(proposals)).toEqual([
            ["flow_yes", "skipped", undefined, false],
            ["Flow_1", "rename", "flow_yes2", true],
        ]);
    });

    it("skips an element whose name yields no ID", () => {
        const proposals = propose([task("a", ""), task("b", "???")]);

        expect(summary(proposals)).toEqual([
            ["a", "skipped", undefined, false],
            ["b", "skipped", undefined, false],
        ]);
    });

    it("spells IDs as the convention it is given asks", () => {
        const proposals = propose([task("a", "Process data", "bpmn:UserTask")], {
            convention: new naming.ElementIdConvention({ case: "snake_case" }),
        });

        expect(proposals[0]?.newId).toBe("userTask_process_data");
    });
});
