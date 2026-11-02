import { describe, expect, it } from "vitest";

import {
    FormReferenceStatusQuery,
    FormPreviewQuery,
    GetFormPreviewCommand,
    GetFormReferenceStatusCommand,
    NavigateToReferencedModelCommand,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../testing";
import { NavigationFeature } from "./NavigationFeature";
import { FormReferenceStatusParticipant } from "../service/FormReferenceStatusParticipant";

const bpmnWithProcess = (id: string) =>
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="${id}"/>
</bpmn:definitions>`;

function createFeature() {
    const host = createTestHost({
        folders: ["/work"],
        files: {
            "/work/order.bpmn": bpmnWithProcess("Order"),
            "/work/billing.bpmn": bpmnWithProcess("Billing"),
            "/work/approve.form": JSON.stringify({ id: "Form_Approve", components: [] }),
        },
    });
    const editor = host.openEditor("/work/order.bpmn", bpmnWithProcess("Order"));
    const feature = new NavigationFeature(host);
    return { host, editor, editorContribution: feature.editorContribution, feature };
}

describe("NavigationFeature", () => {
    it.each([true, false])(
        "previews the saved form linked from the editor (automatic: %s)",
        async (automatic) => {
            const { editor, editorContribution } = createFeature();

            await editorContribution.commandHandlers.GetFormPreviewCommand(
                new GetFormPreviewCommand(1, "Form_Approve", automatic),
                editor.id,
            );

            expect(editor.postedOfType("FormPreviewQuery")).toEqual([
                new FormPreviewQuery(1, {
                    kind: "loaded",
                    content: JSON.stringify({ id: "Form_Approve", components: [] }),
                }),
            ]);
        },
    );

    it("opens the model a call activity references", async () => {
        const { host, editor, editorContribution } = createFeature();

        await editorContribution.commandHandlers.NavigateToReferencedModelCommand(
            new NavigateToReferencedModelCommand("Billing", "process"),
            editor.id,
        );

        expect(host.notifier.openedDocuments).toEqual(["/work/billing.bpmn"]);
    });

    it("tells the editor which linked forms resolve", async () => {
        const { editor, editorContribution } = createFeature();

        await editorContribution.commandHandlers.GetFormReferenceStatusCommand(
            new GetFormReferenceStatusCommand(),
            editor.id,
        );

        expect(editor.postedOfType("FormReferenceStatusQuery")).toEqual([
            new FormReferenceStatusQuery(["Form_Approve"]),
        ]);
        expect(editorContribution.participant).toBeInstanceOf(FormReferenceStatusParticipant);
    });

    it("stops watching the workspace once disposed", async () => {
        const { host, editor, editorContribution, feature } = createFeature();
        await editorContribution.commandHandlers.GetFormReferenceStatusCommand(
            new GetFormReferenceStatusCommand(),
            editor.id,
        );
        const watching = () => host.workspace.watchers.filter(({ disposed }) => !disposed);
        expect(watching()).not.toEqual([]);

        feature.dispose();

        expect(watching()).toEqual([]);
    });
});
