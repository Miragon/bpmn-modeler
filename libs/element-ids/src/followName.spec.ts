import { naming } from "@miragon/bpmnlint-plugin-rules";
import { describe, expect, it } from "vitest";

import type { IdConvention } from "./convention";
import { bpmn as moddle } from "./__fixtures__/moddle";
import { followsChange } from "./followName";

const miragon = new naming.ElementIdConvention();

const follows = (
    id: string,
    oldName: string | undefined,
    oldType = "bpmn:Task",
    convention: IdConvention = miragon,
) => followsChange({ id, oldName, oldElement: moddle.create(oldType), convention });

describe("followsChange", () => {
    it.each<[string, string]>([
        ["Activity_0x1y2z3", "bpmn:UserTask"],
        ["Flow_1m2n3b4", "bpmn:SequenceFlow"],
        ["SequenceFlow_0h21x7r", "bpmn:SequenceFlow"],
        ["Gateway_1q2w3e4", "bpmn:ExclusiveGateway"],
        ["Task_1hcentk", "bpmn:UserTask"],
        ["Participant_0p1q2r3", "bpmn:Participant"],
    ])("follows the random ID %s bpmn-js generated for a %s", (id, oldType) => {
        expect(follows(id, undefined, oldType)).toBe(true);
    });

    it.each<[string, string]>([
        ["StartEvent_1", "bpmn:StartEvent"],
        ["Task_12", "bpmn:ServiceTask"],
        ["Process_1", "bpmn:Process"],
        ["DataObjectReference_2", "bpmn:DataObjectReference"],
    ])("follows the numbered placeholder %s on a %s", (id, oldType) => {
        expect(follows(id, "Anything", oldType)).toBe(true);
    });

    it.each<[string, string]>([
        ["Invoice_1", "bpmn:Task"],
        ["Invoice_1", "bpmn:DataObjectReference"],
        ["Order_2024q1a", "bpmn:Task"],
        ["Flow_12", "bpmn:Task"],
        ["Activity_1", "bpmn:StartEvent"],
    ])("leaves %s on a %s, a number after a prefix bpmn-js never gives it", (id, oldType) => {
        expect(follows(id, undefined, oldType)).toBe(false);
    });

    it.each<[string, string, string]>([
        ["task_checkStock", "Check stock", "bpmn:Task"],
        ["task_checkStock2", "Check stock", "bpmn:Task"],
        ["serviceTask_checkStock", "Check stock", "bpmn:ServiceTask"],
        ["gateway_inStock", "In stock?", "bpmn:ExclusiveGateway"],
    ])("follows %s, which was generated from the old name %j", (id, oldName, oldType) => {
        expect(follows(id, oldName, oldType)).toBe(true);
    });

    it("follows an ID generated for the old type, not for another one", () => {
        expect(follows("task_checkOrder", "Check order", "bpmn:Task")).toBe(true);
        expect(follows("task_checkOrder", "Check order", "bpmn:UserTask")).toBe(false);
    });

    it.each<[string, string | undefined]>([
        ["checkStock", "Check stock"],
        ["task_checkStock", "Ship order"],
        ["Task_CheckStock", "Check stock"],
        ["Event_started", undefined],
        ["Gateway_approve", "Approve?"],
        ["ORDER_TASK", "Order"],
    ])("leaves the ID %s someone wrote by hand", (id, oldName) => {
        expect(follows(id, oldName)).toBe(false);
    });

    it("compares with the convention in use", () => {
        const snake = new naming.ElementIdConvention({ case: "snake_case" });

        expect(follows("task_check_stock", "Check stock", "bpmn:Task", snake)).toBe(true);
        expect(follows("task_checkStock", "Check stock", "bpmn:Task", snake)).toBe(false);
    });
});
