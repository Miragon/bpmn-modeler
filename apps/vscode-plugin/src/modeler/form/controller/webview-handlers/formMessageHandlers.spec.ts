import { describe, expect, it, vi } from "vitest";

import { Command, UpdateFormOutputValuesCommand } from "@miragon/bpmn-modeler-shared";

import { getFormInputValuesHandler, updateFormOutputValuesHandler } from "./formMessageHandlers";

const EDITOR_ID = "file:///work/order.form";
const ANY_COMMAND = { type: "Ignored" } as Command;

describe("getFormInputValuesHandler", () => {
    it("propagates a failed send so the router logs it", async () => {
        const failure = new Error("webview gone");
        const formValues = { sendInputValues: vi.fn().mockRejectedValue(failure) };

        await expect(
            getFormInputValuesHandler(formValues as never)(ANY_COMMAND, EDITOR_ID),
        ).rejects.toBe(failure);
        expect(formValues.sendInputValues).toHaveBeenCalledWith(EDITOR_ID);
    });
});

describe("updateFormOutputValuesHandler", () => {
    it("hands the submitted output values to the values controller", () => {
        const formValues = { updateOutputValues: vi.fn() };

        updateFormOutputValuesHandler(formValues as never)(
            new UpdateFormOutputValuesCommand('{"approved":true}'),
            EDITOR_ID,
        );

        expect(formValues.updateOutputValues).toHaveBeenCalledWith(EDITOR_ID, '{"approved":true}');
    });
});
