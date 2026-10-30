import { describe, expect, it } from "vitest";

import {
    GetBpmnModelerSettingCommand,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";
import { VariableDef } from "@miragon/bpmn-modeler-types";

import { ArtifactService } from "../kernel/service/ArtifactService";
import { createTestHost, RecordingScriptEditor } from "../testing";
import { ScriptVariableStore } from "./domain/ScriptVariableStore";
import { ScriptEditorFeature } from "./ScriptEditorFeature";
import { ScriptFileStore } from "./service/ScriptFileStore";

const DIAGRAM = "/work/order.bpmn";
const VARIABLES: VariableDef[] = [
    { name: "amount", origin: "form field", confidence: "declared" } as VariableDef,
];

function createFeature() {
    const host = createTestHost({ folders: ["/work"] });
    const scriptEditor = new RecordingScriptEditor();
    const variables = new ScriptVariableStore();
    const { editorContribution } = new ScriptEditorFeature({
        scriptEditor,
        variables,
        scriptFiles: new ScriptFileStore(
            host.store,
            host.workspace,
            host.settings,
            new ArtifactService(host.workspace, host.settings),
            host.notifier,
            "/tmp",
            (path) => path,
        ),
        notifier: host.notifier,
    });
    return { host, scriptEditor, variables, editorContribution };
}

describe("ScriptEditorFeature", () => {
    it("hands the BPMN editor's script commands to the host's script tabs", async () => {
        const { host, scriptEditor, editorContribution } = createFeature();
        const editor = host.openEditor(DIAGRAM);
        const handlers = editorContribution.commandHandlers;

        await handlers.OpenScriptEditorCommand(
            new OpenScriptEditorCommand(
                "Task_1",
                "script-task",
                undefined,
                undefined,
                "groovy",
                "",
            ),
            editor.id,
        );
        await handlers.OpenScriptEditorsCommand(
            new OpenScriptEditorsCommand([
                { elementId: "Task_2", scriptFormat: "groovy", content: "" },
            ]),
            editor.id,
        );
        await handlers.UpdateScriptSourceCommand(
            new UpdateScriptSourceCommand("Task_1", "script-task", undefined, "x"),
            editor.id,
        );
        await handlers.UpdateScriptVariablesCommand(
            new UpdateScriptVariablesCommand(VARIABLES),
            editor.id,
        );
        await handlers.GetBpmnModelerSettingCommand(new GetBpmnModelerSettingCommand(), editor.id);

        expect({
            opened: scriptEditor.opened.map(({ script }) => script.elementId),
            written: scriptEditor.written.map(({ script }) => script.elementId),
            modelChanges: scriptEditor.modelChanges.map(({ script }) => script.elementId),
            variablePushes: scriptEditor.variablePushes,
            resynced: scriptEditor.resynced,
        }).toEqual({
            opened: ["Task_1"],
            written: ["Task_2"],
            modelChanges: ["Task_1"],
            variablePushes: [editor.id],
            resynced: [editor.id],
        });
    });

    it("closes an editor's script tabs and forgets its variables when the editor closes", async () => {
        const { host, scriptEditor, variables, editorContribution } = createFeature();
        const editor = await host.openSession(DIAGRAM, [editorContribution.participant]);
        variables.setExtracted(editor.id, VARIABLES);
        expect(scriptEditor.disposedEditors).toEqual([]);

        editor.dispose();

        expect(scriptEditor.disposedEditors).toEqual([editor.id]);
        expect(variables.variablesFor(editor.id)).toEqual([]);
    });
});
