import type { ElementIdStyle } from "@miragon/bpmn-modeler-types";
import { describe, expect, it } from "vitest";

import { followsChange } from "./followName";

const follows = (
    id: string,
    oldName: string | undefined,
    style: ElementIdStyle = "typePrefix",
    oldType = "bpmn:Task",
) => followsChange({ id, oldName, oldType, style });

describe("followsChange", () => {
    it.each<[string, string]>([
        ["Activity_0x1y2z3", "bpmn:UserTask"],
        ["Flow_1m2n3b4", "bpmn:SequenceFlow"],
        ["SequenceFlow_0h21x7r", "bpmn:SequenceFlow"],
        ["Gateway_1q2w3e4", "bpmn:ExclusiveGateway"],
        ["Task_1hcentk", "bpmn:UserTask"],
        ["Participant_0p1q2r3", "bpmn:Participant"],
    ])("follows the random ID %s bpmn-js generated for a %s", (id, oldType) => {
        expect(follows(id, undefined, "typePrefix", oldType)).toBe(true);
    });

    it.each<[string, string]>([
        ["StartEvent_1", "bpmn:StartEvent"],
        ["Task_12", "bpmn:ServiceTask"],
        ["Process_1", "bpmn:Process"],
        ["DataObjectReference_2", "bpmn:DataObjectReference"],
    ])("follows the numbered placeholder %s on a %s", (id, oldType) => {
        expect(follows(id, "Anything", "typePrefix", oldType)).toBe(true);
    });

    it.each<[string, string]>([
        ["Invoice_1", "bpmn:Task"],
        ["Invoice_1", "bpmn:DataObjectReference"],
        ["Order_2024q1a", "bpmn:Task"],
        ["Flow_12", "bpmn:Task"],
        ["Activity_1", "bpmn:StartEvent"],
    ])("leaves %s on a %s, a number after a prefix bpmn-js never gives it", (id, oldType) => {
        expect(follows(id, undefined, "typePrefix", oldType)).toBe(false);
    });

    it.each<[string, string, ElementIdStyle]>([
        ["Task_CheckStock", "Check stock", "typePrefix"],
        ["Task_CheckStock_2", "Check stock", "typePrefix"],
        ["CheckStockTask", "Check stock", "typeSuffix"],
        ["task_check_stock", "Check stock", "snakeCase"],
    ])("follows %s, which was generated from the old name %j", (id, oldName, style) => {
        expect(follows(id, oldName, style)).toBe(true);
    });

    it("follows an ID generated for the old type, not for another one", () => {
        expect(follows("Task_CheckOrder", "Check order", "typePrefix", "bpmn:Task")).toBe(true);
        expect(follows("Task_CheckOrder", "Check order", "typePrefix", "bpmn:UserTask")).toBe(
            false,
        );
    });

    it.each<[string, string | undefined]>([
        ["checkStock", "Check stock"],
        ["Task_CheckStock", "Ship order"],
        ["Activity_CheckStock", "Check stock"],
        ["Event_started", undefined],
        ["Gateway_approve", "Approve?"],
        ["ORDER_TASK", "Order"],
    ])("leaves the ID %s someone wrote by hand", (id, oldName) => {
        expect(follows(id, oldName)).toBe(false);
    });

    it("compares with the style in use", () => {
        expect(follows("Task_CheckStock", "Check stock", "typeSuffix")).toBe(false);
    });
});
