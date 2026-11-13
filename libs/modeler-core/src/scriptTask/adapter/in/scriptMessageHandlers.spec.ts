import { describe, expect, it, vi } from "vitest";

import {
    GetBpmnModelerSettingCommand,
    UpdateOpenScriptEditorsQuery,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";
import { ScriptTaskScript, VariableDef } from "@miragon/bpmn-modeler-types";

import { ArtifactService } from "../../../kernel/service/ArtifactService";
import { createTestHost, FakeEditorHandle, RecordingScriptEditor } from "../../../testing";
import { InlineScript } from "../../domain/inlineScript";
import { ScriptVariableStore } from "../../domain/ScriptVariableStore";
import { ScriptFileStore } from "../../service/ScriptFileStore";
import { ScriptTabService } from "../../service/ScriptTabService";
import { ScriptTargetResolver } from "../../service/ScriptTargetResolver";
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

/** The script tabs, the variables and the file store the handlers use. */
function createHandlers() {
    const host = createTestHost({ folders: ["/work"] });
    const diagram = host.openEditor("/work/diagram.bpmn");
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
    const scriptEditor = new RecordingScriptEditor(scriptFiles);
    const scriptTabs = new ScriptTabService(
        host.store,
        scriptEditor,
        new ScriptTargetResolver(host.store, host.picker, host.notifier),
        scriptFiles,
        host.notifier,
    );
    const variables = new ScriptVariableStore();
    return { notifier: host.notifier, diagram, scriptEditor, scriptTabs, variables, scriptFiles };
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

const writtenScriptTask = (
    elementId: string,
    scriptFormat: string,
    content: string,
): InlineScript => ({
    elementId,
    kind: "script-task",
    listenerIndex: undefined,
    eventName: undefined,
    scriptFormat,
    content,
});

describe("resyncScriptEditorsHandler", () => {
    it("locks the editor's open scripts again when the webview asks for its settings", async () => {
        const { diagram, scriptTabs } = createHandlers();
        await scriptTabs.open(EDITOR, writtenScriptTask("Task_1", "groovy", ""));
        diagram.posted.length = 0;

        await resyncScriptEditorsHandler(scriptTabs)(new GetBpmnModelerSettingCommand(), EDITOR);

        expect(
            diagram
                .postedOfType<UpdateOpenScriptEditorsQuery>("UpdateOpenScriptEditorsQuery")
                .map(({ openScripts }) => openScripts.map(({ elementId }) => elementId)),
        ).toEqual([["Task_1"]]);
    });
});

describe("openScriptEditorHandler", () => {
    it("opens the script with every field of the command", async () => {
        const { scriptEditor, scriptTabs, variables, notifier } = createHandlers();

        await openScriptEditorHandler(
            scriptTabs,
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
        const { scriptTabs, variables, notifier } = createHandlers();

        await openScriptEditorHandler(
            scriptTabs,
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
        const { scriptEditor, scriptTabs, variables, notifier } = createHandlers();
        scriptEditor.openFailure = new Error("host went away");

        await expect(
            openScriptEditorHandler(
                scriptTabs,
                variables,
                notifier,
            )(
                new OpenScriptEditorCommand(
                    "Task_1",
                    "script-task",
                    undefined,
                    undefined,
                    "groovy",
                    "",
                ),
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
        const { scriptEditor, scriptTabs, variables, scriptFiles, notifier } = createHandlers();
        let finishFirst!: () => void;
        scriptEditor.writeInterruptions.push(
            new Promise<void>((resolve) => (finishFirst = resolve)),
        );

        const done = openScriptEditorsHandler(
            scriptTabs,
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
        await vi.waitFor(() => expect(scriptEditor.written).toHaveLength(1));
        await new Promise((settle) => setTimeout(settle, 0));
        expect(scriptEditor.written).toEqual([
            { editorId: EDITOR, script: writtenScriptTask("A", "javascript", "a=1") },
        ]);

        finishFirst();
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
        const { scriptEditor, scriptTabs, variables, scriptFiles, notifier } = createHandlers();

        await openScriptEditorsHandler(
            scriptTabs,
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
        formatOfA: string;
        before: (setup: {
            scriptEditor: RecordingScriptEditor;
            scriptTabs: ScriptTabService;
        }) => Promise<void>;
        summary: string;
    }>([
        {
            case: "the already-open count when a script was left untouched",
            formatOfA: "groovy",
            before: ({ scriptTabs }) =>
                scriptTabs.open(EDITOR, writtenScriptTask("B", "groovy", "b=2")),
            summary: `Generated 1 script file(s) in ${FOLDER} (1 already open, left untouched) — open a file to edit it with live sync into the diagram.`,
        },
        {
            case: "a cancelled language prompt as neither written nor already open",
            formatOfA: "",
            before: async () => undefined,
            summary: `Generated 1 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram.`,
        },
        {
            case: "a failed write, and still writes the rest",
            formatOfA: "groovy",
            before: async ({ scriptEditor }) => {
                scriptEditor.writeInterruptions.push(new Error("EACCES: permission denied"));
            },
            summary: `Generated 1 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram. Could not write 1 script file(s); see the log for details.`,
        },
    ])("counts $case", async ({ formatOfA, before, summary }) => {
        const { scriptEditor, scriptTabs, variables, scriptFiles, notifier } = createHandlers();
        await before({ scriptEditor, scriptTabs });

        await openScriptEditorsHandler(
            scriptTabs,
            variables,
            scriptFiles,
            notifier,
        )(
            new OpenScriptEditorsCommand(
                [scriptTask("A", formatOfA, "a=1"), scriptTask("B", "groovy", "b=2")],
                [],
            ),
            EDITOR,
        );

        expect(notifier.infos).toEqual([summary]);
    });

    it("logs a failed write with the element it was for", async () => {
        const { scriptEditor, scriptTabs, variables, scriptFiles, notifier } = createHandlers();
        scriptEditor.writeInterruptions.push(new Error("EACCES: permission denied"));

        await openScriptEditorsHandler(
            scriptTabs,
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

    it.each([
        {
            case: "the OS temp folder for a diagram that is not a file",
            editorId: UNTITLED_EDITOR,
            scriptFormat: "groovy",
            summary:
                "Generated 1 script file(s) in /tmp/miragon-bpmn-modeler/tmp/scripting — open a file to edit it with live sync into the diagram.",
        },
        {
            case: "no folder when no script got as far as resolving one",
            editorId: EDITOR,
            scriptFormat: "",
            summary: "No script files generated.",
        },
    ])("names $case", async ({ editorId, scriptFormat, summary }) => {
        const { scriptTabs, variables, scriptFiles, notifier } = createHandlers();

        await openScriptEditorsHandler(
            scriptTabs,
            variables,
            scriptFiles,
            notifier,
        )(new OpenScriptEditorsCommand([scriptTask("A", scriptFormat, "")], []), editorId);

        expect(notifier.infos).toEqual([summary]);
    });
});

describe("updateScriptVariablesHandler", () => {
    it("replaces the editor's variables and tells the script editor", async () => {
        const { scriptEditor, scriptTabs, variables } = createHandlers();
        variables.setExtracted(EDITOR, [
            { name: "stale", origin: "output mapping", confidence: "declared" } as VariableDef,
        ]);

        await updateScriptVariablesHandler(scriptTabs, variables)(
            new UpdateScriptVariablesCommand(VARIABLES),
            EDITOR,
        );

        expect(variables.variablesFor(EDITOR)).toEqual(VARIABLES);
        expect(scriptEditor.variablePushes).toEqual([{ editorId: EDITOR, script: [] }]);
    });
});

describe("updateScriptSourceHandler", () => {
    const TAB = "/work/.camunda/tmp/scripting";

    it("replaces what the script's tab holds with the model's content", async () => {
        const { scriptEditor, scriptTabs } = createHandlers();
        await scriptTabs.open(EDITOR, writtenScriptTask("Task_1", "groovy", "x"));

        await updateScriptSourceHandler(scriptTabs)(
            new UpdateScriptSourceCommand("Task_1", "script-task", undefined, "undone"),
            EDITOR,
        );

        expect(scriptEditor.contentUpdates).toEqual([
            { tabPath: expect.stringContaining(TAB), content: "undone" },
        ]);
    });

    it("closes the tab of a script the model removed", async () => {
        const { scriptEditor, scriptTabs } = createHandlers();
        await scriptTabs.open(EDITOR, writtenScriptTask("Task_1", "groovy", "x"));

        await updateScriptSourceHandler(scriptTabs)(
            new UpdateScriptSourceCommand("Task_1", "script-task", undefined, undefined),
            EDITOR,
        );

        expect(scriptEditor.closedTabs).toEqual([expect.stringContaining(TAB)]);
    });
});
