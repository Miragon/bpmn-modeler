import type { ElementIdStyle } from "@miragon/bpmn-modeler-types";
import { describe, expect, it } from "vitest";

import { followsNameChange } from "./followName";

const follows = (
    id: string,
    oldName: string | undefined,
    style: ElementIdStyle = "typePrefix",
    type = "bpmn:Task",
) => followsNameChange({ id, oldName, type, style });

describe("followsNameChange", () => {
    it.each(["Activity_0x1y2z3", "Flow_1m2n3b4", "SequenceFlow_0h21x7r", "Gateway_1q2w3e4"])(
        "follows the random ID %s bpmn-js generated",
        (id) => {
            expect(follows(id, undefined)).toBe(true);
        },
    );

    it.each(["StartEvent_1", "Task_12", "Process_1"])(
        "follows the numbered placeholder %s",
        (id) => {
            expect(follows(id, "Anything")).toBe(true);
        },
    );

    it.each<[string, string, ElementIdStyle]>([
        ["Activity_CheckStock", "Check stock", "typePrefix"],
        ["Activity_CheckStock_2", "Check stock", "typePrefix"],
        ["CheckStockTask", "Check stock", "typeSuffix"],
        ["activity_check_stock", "Check stock", "snakeCase"],
    ])("follows %s, which was generated from the old name %j", (id, oldName, style) => {
        expect(follows(id, oldName, style)).toBe(true);
    });

    it.each<[string, string | undefined]>([
        ["checkStock", "Check stock"],
        ["Activity_CheckStock", "Ship order"],
        ["Event_started", undefined],
        ["Gateway_approve", "Approve?"],
        ["ORDER_TASK", "Order"],
    ])("leaves the ID %s someone wrote by hand", (id, oldName) => {
        expect(follows(id, oldName)).toBe(false);
    });

    it("compares with the style in use", () => {
        expect(follows("Activity_CheckStock", "Check stock", "typeSuffix")).toBe(false);
    });
});
