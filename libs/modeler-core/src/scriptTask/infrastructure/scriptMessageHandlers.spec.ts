import { describe, expect, it } from "vitest";

import {
    GetBpmnModelerSettingCommand,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";
import { ScriptTaskScript, VariableDef } from "@miragon/bpmn-modeler-types";

import { ArtifactService } from "../../kernel/service/ArtifactService";
import { createTestHost, FakeEditorHandle, RecordingScriptEditor } from "../../testing";
import { ScriptMaterialization } from "../domain/scriptBatchSummary";
import { ScriptVariableStore } from "../domain/ScriptVariableStore";
import { ScriptFileStore } from "../service/ScriptFileStore";
import {
    openScriptEditorHandler,
    openScriptEditorsHandler,
    resyncScriptEditorsHandler,
    updateScriptSourceHandler,
    updateScriptVariablesHandler,
} from "./scriptMessageHandlers";

const EDITOR = "file:///work/diagram.bpmn";
const UNTITLED_EDITOR = "untitled://Untitled-1";
const FOLDER = ".camunda/tmp/scripting";
const VARIABLES: VariableDef[] = [
    { name: "amount", origin: "form field", confidence: "declared" } as VariableDef,
];

/**
 * The script editor, the variables and the file store the handlers use; the
 * store holds the base dirs of `resolvedFor` as a real script write leaves them.
 */
async function createHandlers(resolvedFor: string[] = [EDITOR]) {
    const host = createTestHost({ folders: ["/work"] });
    host.openEditor("/work/diagram.bpmn");
    host.store.register(new FakeEditorHandle("Untitled-1", { scheme: "untitled" }));
    const scriptFiles = new ScriptFileStore(
        host.store,
        host.workspace,
        host.settings,
        new ArtifactService(host.workspace, host.settings),
        host.notifier,
        "/tmp",
        (path) => path,
    );
    for (const editorId of resolvedFor) {
        await scriptFiles.baseDirFor(editorId);
    }
    const scriptEditor = new RecordingScriptEditor();
    const variables = new ScriptVariableStore();
    return { notifier: host.notifier, scriptEditor, variables, scriptFiles };
}

const scriptTask = (
    elementId: string,
    scriptFormat: string,
    content: string,
): ScriptTaskScript => ({
    elementId,
    scriptFormat,
    content,
});

const writtenScriptTask = (elementId: string, scriptFormat: string, content: string) => ({
    elementId,
    kind: "script-task",
    listenerIndex: undefined,
    eventName: undefined,
    scriptFormat,
    content,
});

describe("resyncScriptEditorsHandler", () => {
    it("resyncs the editor's script tabs when the webview asks for its settings", async () => {
        const { scriptEditor } = await createHandlers();

        await resyncScriptEditorsHandler(scriptEditor)(new GetBpmnModelerSettingCommand(), EDITOR);

        expect(scriptEditor.resynced).toEqual([EDITOR]);
    });

    it("hands a failed resync to the router, which logs it", async () => {
        const { scriptEditor } = await createHandlers();
        scriptEditor.resyncFailure = new Error("webview hidden again");

        await expect(
            resyncScriptEditorsHandler(scriptEditor)(new GetBpmnModelerSettingCommand(), EDITOR),
        ).rejects.toThrow("webview hidden again");
    });
});

describe("openScriptEditorHandler", () => {
    it("opens the script with every field of the command", async () => {
        const { scriptEditor, variables, notifier } = await createHandlers();

        await openScriptEditorHandler(
            scriptEditor,
            variables,
            notifier,
        )(
            new OpenScriptEditorCommand(
                "Element_1",
                "execution-listener",
                2,
                "start",
                "javascript",
                "x=1",
            ),
            EDITOR,
        );

        expect(scriptEditor.opened).toEqual([
            {
                editorId: EDITOR,
                script: {
                    elementId: "Element_1",
                    kind: "execution-listener",
                    listenerIndex: 2,
                    eventName: "start",
                    scriptFormat: "javascript",
                    content: "x=1",
                },
            },
        ]);
    });

    it("stores the command's variables for completion", async () => {
        const { scriptEditor, variables, notifier } = await createHandlers();

        await openScriptEditorHandler(
            scriptEditor,
            variables,
            notifier,
        )(
            new OpenScriptEditorCommand(
                "Element_1",
                "script-task",
                undefined,
                undefined,
                "groovy",
                "",
                VARIABLES,
            ),
            EDITOR,
        );

        expect(variables.variablesFor(EDITOR)).toEqual(VARIABLES);
    });

    it("logs a failed open with the element it was for", async () => {
        const { scriptEditor, variables, notifier } = await createHandlers();
        scriptEditor.openFailure = new Error("host went away");

        await expect(
            openScriptEditorHandler(
                scriptEditor,
                variables,
                notifier,
            )(
                new OpenScriptEditorCommand("Task_1", "script-task", undefined, undefined, "", ""),
                EDITOR,
            ),
        ).resolves.toBeUndefined();

        expect(notifier.logged("error")).toEqual([
            expect.stringMatching(/^Could not open the script of Task_1: .*host went away/),
        ]);
    });
});

describe("openScriptEditorsHandler", () => {
    it("writes the scripts one after another, never two at once", async () => {
        // Each write may ask for a language; writes in parallel would stack the prompts.
        const { scriptEditor, variables, scriptFiles, notifier } = await createHandlers();
        let finishFirst!: (result: ScriptMaterialization) => void;
        scriptEditor.materializations.push(
            new Promise<ScriptMaterialization>((resolve) => (finishFirst = resolve)),
        );

        const done = openScriptEditorsHandler(
            scriptEditor,
            variables,
            scriptFiles,
            notifier,
        )(
            new OpenScriptEditorsCommand(
                [scriptTask("A", "javascript", "a=1"), scriptTask("B", "groovy", "b=2")],
                VARIABLES,
            ),
            EDITOR,
        );

        expect(variables.variablesFor(EDITOR)).toEqual(VARIABLES);
        expect(scriptEditor.written).toEqual([
            { editorId: EDITOR, script: writtenScriptTask("A", "javascript", "a=1") },
        ]);

        finishFirst({ kind: "written" });
        await done;

        expect(scriptEditor.written).toEqual([
            { editorId: EDITOR, script: writtenScriptTask("A", "javascript", "a=1") },
            { editorId: EDITOR, script: writtenScriptTask("B", "groovy", "b=2") },
        ]);
        expect(notifier.infos).toEqual([
            `Generated 2 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram.`,
        ]);
    });

    it("shows an info message and writes nothing for an empty batch", async () => {
        const { scriptEditor, variables, scriptFiles, notifier } = await createHandlers();

        await openScriptEditorsHandler(
            scriptEditor,
            variables,
            scriptFiles,
            notifier,
        )(new OpenScriptEditorsCommand([], VARIABLES), EDITOR);

        expect(notifier.infos).toEqual([
            "No script tasks with inline scripts found in this diagram.",
        ]);
        expect(scriptEditor.written).toEqual([]);
        expect(variables.variablesFor(EDITOR)).toEqual([]);
    });

    it.each<{
        case: string;
        materializations: (ScriptMaterialization | Error)[];
        summary: string;
    }>([
        {
            case: "the already-open count when a script was left untouched",
            materializations: [{ kind: "written" }, { kind: "alreadyOpen" }],
            summary: `Generated 1 script file(s) in ${FOLDER} (1 already open, left untouched) — open a file to edit it with live sync into the diagram.`,
        },
        {
            case: "a cancelled language prompt as neither written nor already open",
            materializations: [{ kind: "cancelled" }, { kind: "written" }],
            summary: `Generated 1 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram.`,
        },
        {
            case: "a failed write, and still writes the rest",
            materializations: [new Error("EACCES: permission denied"), { kind: "written" }],
            summary: `Generated 1 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram. Could not write 1 script file(s); see the log for details.`,
        },
    ])("counts $case", async ({ materializations, summary }) => {
        const { scriptEditor, variables, scriptFiles, notifier } = await createHandlers();
        scriptEditor.materializations.push(...materializations);

        await openScriptEditorsHandler(
            scriptEditor,
            variables,
            scriptFiles,
            notifier,
        )(
            new OpenScriptEditorsCommand(
                [scriptTask("A", "groovy", "a=1"), scriptTask("B", "groovy", "b=2")],
                [],
            ),
            EDITOR,
        );

        expect(scriptEditor.written).toHaveLength(2);
        expect(notifier.infos).toEqual([summary]);
    });

    it("logs a failed write with the element it was for", async () => {
        const { scriptEditor, variables, scriptFiles, notifier } = await createHandlers();
        scriptEditor.materializations.push(new Error("EACCES: permission denied"));

        await openScriptEditorsHandler(
            scriptEditor,
            variables,
            scriptFiles,
            notifier,
        )(new OpenScriptEditorsCommand([scriptTask("B", "groovy", "b=2")], []), EDITOR);

        expect(notifier.logged("error")).toEqual([
            expect.stringMatching(
                /^Could not write the script file of B: Error: EACCES: permission denied/,
            ),
        ]);
    });

    it.each<{
        case: string;
        editorId: string;
        resolvedFor: string[];
        materialization: ScriptMaterialization;
        summary: string;
    }>([
        {
            case: "the OS temp folder for a diagram that is not a file",
            editorId: UNTITLED_EDITOR,
            resolvedFor: [UNTITLED_EDITOR],
            materialization: { kind: "written" },
            summary:
                "Generated 1 script file(s) in /tmp/miragon-bpmn-modeler/tmp/scripting — open a file to edit it with live sync into the diagram.",
        },
        {
            case: "no folder when no script got as far as resolving one",
            editorId: EDITOR,
            resolvedFor: [],
            materialization: { kind: "cancelled" },
            summary: "No script files generated.",
        },
    ])("names $case", async ({ editorId, resolvedFor, materialization, summary }) => {
        const { scriptEditor, variables, scriptFiles, notifier } =
            await createHandlers(resolvedFor);
        scriptEditor.materializations.push(materialization);

        await openScriptEditorsHandler(
            scriptEditor,
            variables,
            scriptFiles,
            notifier,
        )(new OpenScriptEditorsCommand([scriptTask("A", "groovy", "")], []), editorId);

        expect(notifier.infos).toEqual([summary]);
    });
});

describe("updateScriptVariablesHandler", () => {
    it("replaces the editor's variables and tells the script editor", async () => {
        const { scriptEditor, variables } = await createHandlers();
        variables.setExtracted(EDITOR, [
            { name: "stale", origin: "output mapping", confidence: "declared" } as VariableDef,
        ]);

        await updateScriptVariablesHandler(scriptEditor, variables)(
            new UpdateScriptVariablesCommand(VARIABLES),
            EDITOR,
        );

        expect(variables.variablesFor(EDITOR)).toEqual(VARIABLES);
        expect(scriptEditor.variablePushes).toEqual([EDITOR]);
    });
});

describe("updateScriptSourceHandler", () => {
    it.each([
        { case: "a model-side content change", content: "undone" },
        { case: "the deletion signal (no content)", content: undefined },
    ])("hands $case to the script editor unchanged", async ({ content }) => {
        const { scriptEditor } = await createHandlers();

        await updateScriptSourceHandler(scriptEditor)(
            new UpdateScriptSourceCommand("Task_1", "script-task", undefined, content),
            EDITOR,
        );

        expect(scriptEditor.modelChanges).toEqual([
            {
                editorId: EDITOR,
                script: {
                    elementId: "Task_1",
                    kind: "script-task",
                    listenerIndex: undefined,
                    content,
                },
            },
        ]);
    });
});
