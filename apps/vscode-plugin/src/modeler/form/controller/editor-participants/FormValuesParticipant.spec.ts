import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtensionContext } from "vscode";

import { createTestHost } from "@miragon/bpmn-modeler-core/testing";

vi.mock("vscode", () => import("../../../../__fixtures__/vscodeVirtualDocumentsFake"));

import {
    commands,
    renderedTabs,
    resetVscodeVirtualDocuments,
} from "../../../../__fixtures__/vscodeVirtualDocumentsFake";
import {
    FormValuesController,
    TOGGLE_FORM_INPUT_VALUES_CMD,
    TOGGLE_FORM_OUTPUT_VALUES_CMD,
} from "../FormValuesController";
import { FormValuesParticipant } from "./FormValuesParticipant";

const extension: Pick<ExtensionContext, "subscriptions"> = { subscriptions: [] };

function createFormEditors() {
    const host = createTestHost();
    const formValues = new FormValuesController(host.store, host.notifier);
    formValues.register(extension as ExtensionContext);
    const participant = new FormValuesParticipant(formValues);
    return {
        host,
        open: (path: string) => host.openSession(path, [participant]),
    };
}

async function showValuesBesideActiveForm(): Promise<void> {
    await commands.executeCommand(TOGGLE_FORM_INPUT_VALUES_CMD);
    await commands.executeCommand(TOGGLE_FORM_OUTPUT_VALUES_CMD);
}

/** Lets the fire-and-forget retirement on close run to its end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
    resetVscodeVirtualDocuments();
});

afterEach(() => {
    extension.subscriptions.splice(0).forEach((subscription) => subscription.dispose());
});

describe("FormValuesParticipant", () => {
    it("gives an opened form empty input and read-only output values to show beside it", async () => {
        const forms = createFormEditors();
        await forms.open("/work/order.form");

        await showValuesBesideActiveForm();

        expect(renderedTabs()).toEqual([
            { name: "order.input.json", content: "{}", readOnly: false },
            { name: "order.output.json", content: "{}", readOnly: true },
        ]);
    });

    it("closes the form's values tabs when the form closes", async () => {
        const forms = createFormEditors();
        const order = await forms.open("/work/order.form");
        await showValuesBesideActiveForm();

        order.dispose();
        await settle();

        expect(renderedTabs()).toEqual([]);
    });

    it("leaves another form's values open when one form closes", async () => {
        const forms = createFormEditors();
        const order = await forms.open("/work/order.form");
        await forms.open("/work/invoice.form");
        await showValuesBesideActiveForm();

        order.dispose();
        await settle();

        expect(renderedTabs().map((tab) => tab.name)).toEqual([
            "invoice.input.json",
            "invoice.output.json",
        ]);
    });
});
