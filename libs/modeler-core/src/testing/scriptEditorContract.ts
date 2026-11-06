import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditorSessionStore } from "../editorSession/service/EditorSessionStore";
import { NotifierPort, PickerPort, SettingsPort } from "../kernel/port/hostPorts";
import { ArtifactService } from "../kernel/service/ArtifactService";
import { InlineScript } from "../scriptTask/domain/inlineScript";
import { ScriptMaterialization } from "../scriptTask/domain/scriptBatchSummary";
import { scriptLanguagePrompt } from "../scriptTask/domain/scriptLanguage";
import { ScriptUri, TMP_SCRIPTING_SEGMENT } from "../scriptTask/domain/ScriptUri";
import { ScriptVariableStore } from "../scriptTask/domain/ScriptVariableStore";
import { ScriptEditorPort } from "../scriptTask/port/ScriptEditorPort";
import { ScriptFileStore } from "../scriptTask/service/ScriptFileStore";
import { createTestHost } from "./createTestHost";
import { FakeEditorHandle } from "./FakeEditorHandle";

/** What an adapter under {@link describeScriptEditorContract} is built from; the scenarios drive and read the same objects. */
export interface ScriptEditorContractHost {
    readonly store: EditorSessionStore;
    readonly scriptFiles: ScriptFileStore;
    readonly picker: PickerPort;
    readonly notifier: NotifierPort;
    readonly settings: SettingsPort;
    readonly variables: ScriptVariableStore;
}

/** One {@link ScriptEditorPort} adapter under the {@link describeScriptEditorContract} scenarios. */
export interface ScriptEditorContractFixture {
    readonly scriptEditor: ScriptEditorPort;
    /** Closes the tab of the script file at `filePath` the way the user would. */
    closeTab(filePath: string): Promise<void>;
}

const ROOT = "/work";
const SHARE_ROOT = "//server/share/repo";
const OS_TEMP = "/tmp";
const FOLDER = ".camunda/tmp/scripting";
const OS_TEMP_FOLDER = "/tmp/miragon-bpmn-modeler/tmp/scripting";

const EDITOR = `file://${ROOT}/order.bpmn`;
const OTHER_EDITOR = `file://${ROOT}/invoice.bpmn`;
const SHARE_EDITOR = `file://${SHARE_ROOT}/order.bpmn`;
const UNTITLED_EDITOR = "untitled://Untitled-1";

const BASE_DIR = `${ROOT}/${FOLDER}`;
const HASH = ScriptUri.hashEditorId(EDITOR);
const OTHER_HASH = ScriptUri.hashEditorId(OTHER_EDITOR);
const TASK_FILE = `${BASE_DIR}/${HASH}/Task_1/script-task/Task_1.groovy`;
const LANGUAGE_PROMPT = scriptLanguagePrompt("").id;

function scriptTask(fields: Partial<InlineScript> = {}): InlineScript {
    return {
        elementId: "Task_1",
        kind: "script-task",
        listenerIndex: undefined,
        eventName: undefined,
        scriptFormat: "groovy",
        content: "x = 1",
        ...fields,
    };
}

const startListener = scriptTask({
    kind: "execution-listener",
    listenerIndex: 0,
    eventName: "start",
    content: "started = true",
});

/** One macrotask turn: what an adapter left running, and a host's answer sent a turn later, has finished. */
function settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function createContractHost() {
    const diagrams = [`${ROOT}/order.bpmn`, `${ROOT}/invoice.bpmn`, `${SHARE_ROOT}/order.bpmn`];
    const languageAnswers: Record<string, unknown> = {};
    const testHost = createTestHost({
        folders: [ROOT, SHARE_ROOT],
        files: Object.fromEntries(diagrams.map((diagram) => [diagram, ""])),
        promptAnswers: languageAnswers,
    });
    diagrams.forEach((diagram) => testHost.openEditor(diagram));
    testHost.store.register(new FakeEditorHandle("Untitled-1", { scheme: "untitled" }));
    const ports: ScriptEditorContractHost = {
        store: testHost.store,
        scriptFiles: new ScriptFileStore(
            testHost.store,
            testHost.workspace,
            testHost.settings,
            new ArtifactService(testHost.workspace, testHost.settings),
            testHost.notifier,
            OS_TEMP,
            (path) => path,
        ),
        picker: testHost.picker,
        notifier: testHost.notifier,
        settings: testHost.settings,
        variables: new ScriptVariableStore(),
    };
    return { ...testHost, ports, languageAnswers };
}

/**
 * The rules of {@link ScriptEditorPort} the core relies on, run against one
 * adapter. The core reads back only `materialize`: "Generate Script Files"
 * counts its answers, names the folder the shared {@link ScriptFileStore}
 * resolved, and asks the user to open the files, which both hosts adopt by
 * their path. So the scenarios pin where a file goes and how its path is
 * spelled, when an open tab owns a script, the dismissal value and that a
 * failed write rejects. `open`, `applyModelChange`, a tab the user closes and
 * `disposeEditor` take part as far as they change those answers or the files.
 * Where the hosts differ, VS Code is the reference.
 *
 * Left out, as the core reads none of it back: `resync` and `variablesChanged`,
 * where the hosts differ by design (VS Code replays the edits its hidden
 * webview missed and completes from the variable store; a JCEF webview never
 * hides, and the bridge pushes the variables to its tabs); what a tab shows
 * and streams back, VS Code's JavaScript typings beside a script included; the
 * language pick sent back to the webview; and the file of a script the model
 * removed, which both hosts delete once its tab has closed, while the port
 * promises deleted files only from `disposeEditor`. Windows drive-letter and
 * backslash spellings are left to each host's own spec (VS Code's
 * `canonicalPath.spec.ts` and `uriPath.spec.ts`, the bridge's `win32` block in
 * `BridgeScriptEditor.spec.ts`), as the shared in-memory workspace speaks POSIX.
 *
 * The scenarios run on real timers: a host may answer a turn later, as
 * IntelliJ does.
 */
export function describeScriptEditorContract(
    adapter: string,
    createFixture: (host: ScriptEditorContractHost) => Promise<ScriptEditorContractFixture>,
): void {
    describe(`${adapter} keeps the ScriptEditorPort contract`, () => {
        let host: ReturnType<typeof createContractHost>;
        let fixture: ScriptEditorContractFixture;

        beforeEach(async () => {
            host = createContractHost();
            fixture = await createFixture(host.ports);
        });

        const scriptFilesOnDisk = () =>
            [...host.workspace.files.keys()]
                .filter((path) => path.includes(`/${TMP_SCRIPTING_SEGMENT}/`))
                .sort();

        describe("a script the model names a language for", () => {
            it.each([
                {
                    script: "a script task",
                    editorId: EDITOR,
                    written: scriptTask({ scriptFormat: "javascript", content: "x = 1;" }),
                    path: `${BASE_DIR}/${HASH}/Task_1/script-task/Task_1.js`,
                    folder: FOLDER,
                },
                {
                    script: "an execution listener, named by its event",
                    editorId: EDITOR,
                    written: startListener,
                    path: `${BASE_DIR}/${HASH}/Task_1/execution-listener-0-start/Task_1.execution-start.groovy`,
                    folder: FOLDER,
                },
                {
                    script: "the second task listener of an element, numbered",
                    editorId: EDITOR,
                    written: scriptTask({
                        elementId: "UserTask_1",
                        kind: "task-listener",
                        listenerIndex: 1,
                        eventName: "create",
                        scriptFormat: "python",
                    }),
                    path: `${BASE_DIR}/${HASH}/UserTask_1/task-listener-1-create/UserTask_1.task-create-1.py`,
                    folder: FOLDER,
                },
                {
                    script: "a script of a diagram on a network share, keeping its root",
                    editorId: SHARE_EDITOR,
                    written: scriptTask(),
                    path: `${SHARE_ROOT}/${FOLDER}/${ScriptUri.hashEditorId(SHARE_EDITOR)}/Task_1/script-task/Task_1.groovy`,
                    folder: FOLDER,
                },
                {
                    script: "a script of a diagram that is no file, into the OS temp folder",
                    editorId: UNTITLED_EDITOR,
                    written: scriptTask(),
                    path: `${OS_TEMP_FOLDER}/${ScriptUri.hashEditorId(UNTITLED_EDITOR)}/Task_1/script-task/Task_1.groovy`,
                    folder: OS_TEMP_FOLDER,
                },
            ])(
                "writes $script at its path without asking, in the folder the store names",
                async ({ editorId, written, path, folder }) => {
                    await expect(
                        fixture.scriptEditor.materialize(editorId, written),
                    ).resolves.toEqual({ kind: "written" });

                    expect(host.workspace.files.get(path)).toBe(written.content);
                    expect(host.ports.scriptFiles.displayNameFor(editorId)).toBe(folder);
                    expect(host.picker.prompts).toEqual([]);
                },
            );

            it("writes the model's content again on the next run, as writing opens no tab", async () => {
                await fixture.scriptEditor.materialize(EDITOR, scriptTask({ content: "first" }));

                await expect(
                    fixture.scriptEditor.materialize(EDITOR, scriptTask({ content: "second" })),
                ).resolves.toEqual({ kind: "written" });
                expect(host.workspace.files.get(TASK_FILE)).toBe("second");
            });
        });

        describe("a script whose language the model lacks", () => {
            it("asks for one with the core's prompt and writes the file in the language picked", async () => {
                host.languageAnswers[LANGUAGE_PROMPT] = "python";

                await expect(
                    fixture.scriptEditor.materialize(
                        EDITOR,
                        scriptTask({ scriptFormat: "kotlin" }),
                    ),
                ).resolves.toEqual({ kind: "written" });

                expect(host.picker.prompts).toEqual([
                    { method: "choose", args: [scriptLanguagePrompt("kotlin")] },
                ]);
                expect(scriptFilesOnDisk()).toEqual([
                    `${BASE_DIR}/${HASH}/Task_1/script-task/Task_1.py`,
                ]);
            });

            it("answers cancelled when the prompt is dismissed, and writes and names no folder", async () => {
                await expect(
                    fixture.scriptEditor.materialize(EDITOR, scriptTask({ scriptFormat: "" })),
                ).resolves.toEqual({ kind: "cancelled" });

                expect(scriptFilesOnDisk()).toEqual([]);
                expect(host.ports.scriptFiles.displayNameFor(EDITOR)).toBeUndefined();
            });
        });

        describe("a script an open tab owns", () => {
            it("answers alreadyOpen and leaves the tab's file untouched", async () => {
                await fixture.scriptEditor.open(EDITOR, scriptTask({ content: "in the tab" }));
                const filesBefore = new Map(host.workspace.files);

                await expect(
                    fixture.scriptEditor.materialize(
                        EDITOR,
                        scriptTask({ content: "in the model" }),
                    ),
                ).resolves.toEqual({ kind: "alreadyOpen" });
                expect(host.workspace.files).toEqual(filesBefore);
            });

            it.each([
                {
                    written: "another element's script task",
                    opened: { editorId: EDITOR, script: scriptTask() },
                    generated: { editorId: EDITOR, script: scriptTask({ elementId: "Task_2" }) },
                    path: `${BASE_DIR}/${HASH}/Task_2/script-task/Task_2.groovy`,
                },
                {
                    written: "the script task of an element whose execution listener is open",
                    opened: { editorId: EDITOR, script: startListener },
                    generated: { editorId: EDITOR, script: scriptTask() },
                    path: TASK_FILE,
                },
                {
                    written: "the same script task of another diagram",
                    opened: { editorId: EDITOR, script: scriptTask() },
                    generated: { editorId: OTHER_EDITOR, script: scriptTask() },
                    path: `${BASE_DIR}/${OTHER_HASH}/Task_1/script-task/Task_1.groovy`,
                },
            ])("writes $written", async ({ opened, generated, path }) => {
                await fixture.scriptEditor.open(opened.editorId, opened.script);

                await expect(
                    fixture.scriptEditor.materialize(generated.editorId, {
                        ...generated.script,
                        content: "generated",
                    }),
                ).resolves.toEqual({ kind: "written" });
                expect(host.workspace.files.get(path)).toBe("generated");
            });

            it.each<{
                after: string;
                change: (fixture: ScriptEditorContractFixture) => Promise<void>;
                answer: ScriptMaterialization["kind"];
            }>([
                {
                    after: "the model changed the script",
                    change: async ({ scriptEditor }) => {
                        await scriptEditor.applyModelChange(EDITOR, {
                            ...scriptTask(),
                            content: "undone",
                        });
                        await settle();
                    },
                    answer: "alreadyOpen",
                },
                {
                    after: "the user closed its tab",
                    change: async ({ closeTab }) => {
                        await closeTab(TASK_FILE);
                        await settle();
                    },
                    answer: "written",
                },
                {
                    after: "the model removed the script",
                    change: async ({ scriptEditor }) => {
                        await scriptEditor.applyModelChange(EDITOR, {
                            ...scriptTask(),
                            content: undefined,
                        });
                        await settle();
                    },
                    answer: "written",
                },
                {
                    after: "the model removed the script, while the host still closes its tab",
                    change: async ({ scriptEditor }) => {
                        await scriptEditor.applyModelChange(EDITOR, {
                            ...scriptTask(),
                            content: undefined,
                        });
                    },
                    answer: "written",
                },
                {
                    after: "the user reopened the script the model removed, while the host still closes its tab",
                    change: async ({ scriptEditor }) => {
                        await scriptEditor.applyModelChange(EDITOR, {
                            ...scriptTask(),
                            content: undefined,
                        });
                        await scriptEditor.open(EDITOR, scriptTask({ content: "reopened" }));
                        await settle();
                    },
                    answer: "alreadyOpen",
                },
                {
                    after: "the model removed another script of the element",
                    change: async ({ scriptEditor }) => {
                        await scriptEditor.open(EDITOR, startListener);
                        await scriptEditor.applyModelChange(EDITOR, {
                            ...startListener,
                            content: undefined,
                        });
                        await settle();
                    },
                    answer: "alreadyOpen",
                },
            ])("answers $answer once $after", async ({ change, answer }) => {
                await fixture.scriptEditor.open(EDITOR, scriptTask({ content: "in the tab" }));
                await change(fixture);
                const fileBefore = host.workspace.files.get(TASK_FILE);

                const materialized = await fixture.scriptEditor.materialize(
                    EDITOR,
                    scriptTask({ content: "regenerated" }),
                );
                await settle();

                expect(materialized).toEqual({ kind: answer });
                expect(host.workspace.files.get(TASK_FILE)).toBe(
                    answer === "written" ? "regenerated" : fileBefore,
                );
            });
        });

        it.each([
            {
                failure: "the file cannot be written",
                fail: (workspace: ReturnType<typeof createContractHost>["workspace"]) =>
                    vi
                        .spyOn(workspace, "writeFile")
                        .mockRejectedValue(new Error("EACCES: permission denied")),
                error: "EACCES: permission denied",
            },
            {
                failure: "the diagram's workspace cannot be looked up",
                fail: (workspace: ReturnType<typeof createContractHost>["workspace"]) =>
                    vi.spyOn(workspace, "getWorkspaceFolderForDocument").mockImplementation(() => {
                        throw new Error("workspace lookup failed");
                    }),
                error: "workspace lookup failed",
            },
        ])("rejects when $failure, and writes no script file", async ({ fail, error }) => {
            fail(host.workspace);

            await expect(fixture.scriptEditor.materialize(EDITOR, scriptTask())).rejects.toThrow(
                error,
            );
            expect(scriptFilesOnDisk()).toEqual([]);
        });

        it("takes a closed editor's script files with it, opened and written alike, and keeps another editor's", async () => {
            await fixture.scriptEditor.open(EDITOR, scriptTask());
            await fixture.scriptEditor.materialize(EDITOR, scriptTask({ elementId: "Task_2" }));
            await fixture.scriptEditor.materialize(OTHER_EDITOR, scriptTask());

            fixture.scriptEditor.disposeEditor(EDITOR);
            await settle();

            expect(scriptFilesOnDisk()).toEqual([
                `${BASE_DIR}/${OTHER_HASH}/Task_1/script-task/Task_1.groovy`,
            ]);
        });
    });
}
