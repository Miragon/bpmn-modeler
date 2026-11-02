import { describe, expect, it } from "vitest";

import {
    SearchWorkspaceDefinitionsCommand,
    WorkspaceDefinitionsQuery,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../testing";
import { DefinitionSearchFeature } from "./DefinitionSearchFeature";
import { DefinitionSearchParticipant } from "./session/DefinitionSearchParticipant";

const model = (definitions: string) =>
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
        <bpmn:process id="p" />${definitions}</bpmn:definitions>`;

describe("DefinitionSearchFeature", () => {
    it("answers the editor's search with the definitions of other models", async () => {
        const host = createTestHost({
            folders: ["/work"],
            files: {
                "/work/order.bpmn": model(""),
                "/work/billing.bpmn": model('<bpmn:message id="M1" name="paid" />'),
            },
        });
        const editor = host.openEditor("/work/order.bpmn", model(""));
        const { editorContribution } = new DefinitionSearchFeature(host);

        await editorContribution.commandHandlers.SearchWorkspaceDefinitionsCommand(
            new SearchWorkspaceDefinitionsCommand(7, "message", "pai"),
            editor.id,
        );

        const [answer] = editor.postedOfType<WorkspaceDefinitionsQuery>(
            "WorkspaceDefinitionsQuery",
        );
        expect(answer.requestId).toBe(7);
        expect(answer.definitions.map(({ name, source }) => ({ name, path: source.path }))).toEqual(
            [{ name: "paid", path: "billing.bpmn" }],
        );
        expect(editorContribution.participant).toBeInstanceOf(DefinitionSearchParticipant);
    });

    it("stops watching the workspace once disposed", async () => {
        const host = createTestHost({
            folders: ["/work"],
            files: { "/work/order.bpmn": model(""), "/work/billing.bpmn": model("") },
        });
        const editor = host.openEditor("/work/order.bpmn", model(""));
        const feature = new DefinitionSearchFeature(host);
        await feature.editorContribution.commandHandlers.SearchWorkspaceDefinitionsCommand(
            new SearchWorkspaceDefinitionsCommand(1, "message", ""),
            editor.id,
        );
        const watching = () => host.workspace.watchers.filter(({ disposed }) => !disposed);
        expect(watching()).not.toEqual([]);

        feature.dispose();

        expect(watching()).toEqual([]);
    });
});
