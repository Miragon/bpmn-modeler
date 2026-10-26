import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtensionContext } from "vscode";

import {
    FormInputValuesQuery,
    GetFormInputValuesCommand,
    UpdateFormOutputValuesCommand,
} from "@miragon/bpmn-modeler-shared";
import { WebviewMessageRouter } from "@miragon/bpmn-modeler-core";
import { createTestHost } from "@miragon/bpmn-modeler-core/testing";

vi.mock("vscode", () => import("../../../../__fixtures__/vscodeVirtualDocumentsFake"));

import {
    commands,
    renderedTabs,
    resetVscodeVirtualDocuments,
    typeIntoTab,
} from "../../../../__fixtures__/vscodeVirtualDocumentsFake";
import { FormValuesParticipant } from "../editor-participants/FormValuesParticipant";
import {
    FormValuesController,
    TOGGLE_FORM_INPUT_VALUES_CMD,
    TOGGLE_FORM_OUTPUT_VALUES_CMD,
} from "../FormValuesController";
import { getFormInputValuesHandler, updateFormOutputValuesHandler } from "./formMessageHandlers";

const extension: Pick<ExtensionContext, "subscriptions"> = { subscriptions: [] };

function createFormEditors() {
    const host = createTestHost();
    const formValues = new FormValuesController(host.store, host.notifier);
    formValues.register(extension as ExtensionContext);
    const router = new WebviewMessageRouter()
        .on("GetFormInputValuesCommand", getFormInputValuesHandler(formValues))
        .on("UpdateFormOutputValuesCommand", updateFormOutputValuesHandler(formValues));
    const participants = [new FormValuesParticipant(formValues)];
    return {
        host,
        open: (path: string) => host.openSession(path, participants, { router }),
    };
}

/** Lets the router finish the message the webview just sent. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const pretty = (value: object) => JSON.stringify(value, null, 2);

beforeEach(() => {
    resetVscodeVirtualDocuments();
});

afterEach(() => {
    extension.subscriptions.splice(0).forEach((subscription) => subscription.dispose());
});

describe("GetFormInputValuesCommand", () => {
    it("answers the form webview with the form's empty input values", async () => {
        const order = await createFormEditors().open("/work/order.form");

        order.receive(new GetFormInputValuesCommand());
        await settle();

        expect(order.posted).toEqual([new FormInputValuesQuery("{}")]);
    });

    it("answers a reloaded webview with the input values typed beside the form", async () => {
        const order = await createFormEditors().open("/work/order.form");
        await commands.executeCommand(TOGGLE_FORM_INPUT_VALUES_CMD);
        typeIntoTab("order.input.json", '{"customer":{"name":"Ada"}}');
        await settle();
        const postedBeforeReload = order.posted.length;

        order.receive(new GetFormInputValuesCommand());
        await settle();

        expect(order.posted.slice(postedBeforeReload)).toEqual([
            new FormInputValuesQuery(pretty({ customer: { name: "Ada" } })),
        ]);
    });

    it("logs an answer the hidden webview cannot receive", async () => {
        const forms = createFormEditors();
        const order = await forms.open("/work/order.form");
        order.hidden = true;

        order.receive(new GetFormInputValuesCommand());
        await settle();

        expect(forms.host.notifier.logged("error")).toEqual([
            expect.stringContaining("Error: The active editor is hidden.\n"),
        ]);
    });
});

describe("UpdateFormOutputValuesCommand", () => {
    it("shows the values the form submitted in its read-only output document", async () => {
        const order = await createFormEditors().open("/work/order.form");
        await commands.executeCommand(TOGGLE_FORM_OUTPUT_VALUES_CMD);

        order.receive(new UpdateFormOutputValuesCommand('{"approved":true,"amount":42}'));
        await settle();

        expect(renderedTabs()).toEqual([
            {
                name: "order.output.json",
                content: pretty({ approved: true, amount: 42 }),
                readOnly: true,
            },
        ]);
    });

    it("keeps a background form's submitted values out of the active form's output", async () => {
        const forms = createFormEditors();
        const invoice = await forms.open("/work/invoice.form");
        const order = await forms.open("/work/order.form");

        order.receive(new UpdateFormOutputValuesCommand('{"approved":true}'));
        invoice.receive(new UpdateFormOutputValuesCommand('{"invoiceNumber":7}'));
        await settle();
        await commands.executeCommand(TOGGLE_FORM_OUTPUT_VALUES_CMD);

        expect(renderedTabs()).toEqual([
            { name: "order.output.json", content: pretty({ approved: true }), readOnly: true },
        ]);
    });

    it.each([
        ["a list", "[1,2]"],
        ["null", "null"],
        ["incomplete JSON", '{"approved":'],
    ])("keeps the last submitted values when the form sends %s", async (_case, content) => {
        const order = await createFormEditors().open("/work/order.form");
        await commands.executeCommand(TOGGLE_FORM_OUTPUT_VALUES_CMD);
        order.receive(new UpdateFormOutputValuesCommand('{"approved":true}'));

        order.receive(new UpdateFormOutputValuesCommand(content));
        await settle();

        expect(renderedTabs().map((tab) => tab.content)).toEqual([pretty({ approved: true })]);
    });
});
