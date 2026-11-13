import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
} from "@miragon/bpmn-modeler-shared";

import { ArtifactService } from "../../kernel/service/ArtifactService";
import { createTestHost } from "../../testing/createTestHost";
import { RecordingScriptEditor } from "../../testing/RecordingScriptEditor";
import { InlineScript } from "../domain/inlineScript";
import { scriptLanguagePrompt } from "../domain/scriptLanguage";
import { ScriptUri } from "../domain/ScriptUri";
import { SCRIPT_STREAM_DEBOUNCE_MS } from "./ScriptContentStream";
import { ScriptFileStore } from "./ScriptFileStore";
import { ScriptTabService } from "./ScriptTabService";
import { ScriptTargetResolver } from "./ScriptTargetResolver";

const DIAGRAM = "/work/order.bpmn";
const OTHER_DIAGRAM = "/work/invoice.bpmn";
const BASE_DIR = "/work/.camunda/tmp/scripting";
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

function createService({ flushEditsOnEditorClose = false } = {}) {
    const languageAnswers: Record<string, unknown> = {};
    const host = createTestHost({ folders: ["/work"], promptAnswers: languageAnswers });
    const diagram = host.openEditor(DIAGRAM);
    const otherDiagram = host.openEditor(OTHER_DIAGRAM);
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
        { flushEditsOnEditorClose },
    );
    const taskFile = `${BASE_DIR}/${ScriptUri.hashEditorId(diagram.id)}/Task_1/script-task/Task_1.groovy`;
    return { host, diagram, otherDiagram, scriptEditor, scriptTabs, languageAnswers, taskFile };
}

type Diagram = ReturnType<typeof createService>["diagram"];

const lockedScripts = (diagram: Diagram) =>
    diagram
        .postedOfType<UpdateOpenScriptEditorsQuery>("UpdateOpenScriptEditorsQuery")
        .map(({ openScripts }) => openScripts.map(({ fileName }) => fileName));

const streamedContents = (diagram: Diagram) =>
    diagram
        .postedOfType<UpdateScriptContentQuery>("UpdateScriptContentQuery")
        .map(({ content }) => content);

describe("ScriptTabService", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("opening a script", () => {
        it("writes its file, opens its tab and locks its field in the webview", async () => {
            const { diagram, scriptEditor, scriptTabs, host, taskFile } = createService();

            await scriptTabs.open(diagram.id, scriptTask());

            expect(host.workspace.files.get(taskFile)).toBe("x = 1");
            expect(scriptEditor.opened.map(({ script }) => script.elementId)).toEqual(["Task_1"]);
            expect(lockedScripts(diagram)).toEqual([["Task_1.groovy"]]);
            expect(scriptTabs.editorOfTab(taskFile)).toBe(diagram.id);
        });

        it("reveals the open tab of a script opened again, and writes nothing", async () => {
            const { diagram, scriptEditor, scriptTabs, host, taskFile } = createService();
            await scriptTabs.open(diagram.id, scriptTask({ content: "in the tab" }));

            await scriptTabs.open(diagram.id, scriptTask({ content: "revealed" }));

            expect(scriptEditor.revealed).toEqual([taskFile]);
            expect(scriptEditor.opened).toHaveLength(1);
            expect(host.workspace.files.get(taskFile)).toBe("in the tab");
        });

        it("asks for a language the model lacks, writes the pick back and opens the tab in it", async () => {
            const { diagram, scriptEditor, scriptTabs, host, languageAnswers } = createService();
            languageAnswers[LANGUAGE_PROMPT] = "python";

            await scriptTabs.open(diagram.id, scriptTask({ scriptFormat: "kotlin" }));

            expect(host.picker.prompts).toEqual([
                { method: "choose", args: [scriptLanguagePrompt("kotlin")] },
            ]);
            expect(diagram.postedOfType("UpdateScriptFormatQuery")).toEqual([
                new UpdateScriptFormatQuery("Task_1", "script-task", undefined, "python"),
            ]);
            expect(lockedScripts(diagram)).toEqual([["Task_1.py"]]);
            expect(scriptEditor.opened).toHaveLength(1);
        });

        it("opens nothing when the language prompt is dismissed", async () => {
            const { diagram, scriptEditor, scriptTabs } = createService();

            await scriptTabs.open(diagram.id, scriptTask({ scriptFormat: "" }));

            expect(scriptEditor.opened).toEqual([]);
            expect(lockedScripts(diagram)).toEqual([]);
        });

        it("rejects, tracks nothing and locks nothing when the host cannot open the tab", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = createService();
            scriptEditor.openFailure = new Error("EACCES");

            await expect(scriptTabs.open(diagram.id, scriptTask())).rejects.toThrow("EACCES");

            expect(scriptTabs.editorOfTab(taskFile)).toBeUndefined();
            expect(lockedScripts(diagram)).toEqual([]);
        });

        it("counts the tab as open while the host still opens it, so its report is no user open", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = createService();
            let reportedOpen: Promise<void> = Promise.resolve();
            vi.spyOn(scriptEditor, "openTab").mockImplementation(async () => {
                reportedOpen = scriptEditor.openFileByUser(taskFile);
            });

            await scriptTabs.open(diagram.id, scriptTask());
            await reportedOpen;

            expect(scriptEditor.adopted).toEqual([]);
            expect(lockedScripts(diagram)).toEqual([["Task_1.groovy"]]);
        });

        it("adopts no own tab the host reports after the model already removed its script", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = createService();
            let reportedOpen: Promise<void> = Promise.resolve();
            vi.spyOn(scriptEditor, "openTab").mockImplementation(async () => {
                reportedOpen = scriptEditor.openFileByUser(taskFile);
            });
            await scriptTabs.open(diagram.id, scriptTask());

            await scriptTabs.applyModelChange(diagram.id, { ...scriptTask(), content: undefined });
            await reportedOpen;

            expect(scriptEditor.adopted).toEqual([]);
            expect(scriptTabs.editorOfTab(taskFile)).toBeUndefined();
        });
    });

    describe("writing a script without a tab", () => {
        it("answers written and writes the model's content", async () => {
            const { diagram, scriptTabs, host, taskFile } = createService();

            await expect(scriptTabs.materialize(diagram.id, scriptTask())).resolves.toEqual({
                kind: "written",
            });
            expect(host.workspace.files.get(taskFile)).toBe("x = 1");
            expect(lockedScripts(diagram)).toEqual([]);
        });

        it("answers cancelled when the language prompt is dismissed, and writes nothing", async () => {
            const { diagram, scriptEditor, scriptTabs } = createService();

            await expect(
                scriptTabs.materialize(diagram.id, scriptTask({ scriptFormat: "" })),
            ).resolves.toEqual({ kind: "cancelled" });
            expect(scriptEditor.written).toEqual([]);
        });

        it("answers alreadyOpen and leaves the file to the tab that owns the script", async () => {
            const { diagram, scriptEditor, scriptTabs } = createService();
            await scriptTabs.open(diagram.id, scriptTask());

            await expect(
                scriptTabs.materialize(diagram.id, scriptTask({ content: "regenerated" })),
            ).resolves.toEqual({ kind: "alreadyOpen" });
            expect(scriptEditor.written).toEqual([]);
        });
    });

    describe("a model change to a script", () => {
        it("replaces what its tab holds and drops the edit still waiting to stream", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = createService();
            await scriptTabs.open(diagram.id, scriptTask());
            scriptEditor.typeByUser(taskFile, "stale");

            await scriptTabs.applyModelChange(diagram.id, { ...scriptTask(), content: "undone" });
            await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

            expect(scriptEditor.contentUpdates).toEqual([{ tabPath: taskFile, content: "undone" }]);
            expect(streamedContents(diagram)).toEqual([]);
        });

        it("closes the tab of a script the model removed and unlocks its field", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = createService();
            await scriptTabs.open(diagram.id, scriptTask());
            scriptEditor.typeByUser(taskFile, "stale");

            await scriptTabs.applyModelChange(diagram.id, { ...scriptTask(), content: undefined });
            await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

            expect(scriptEditor.closedTabs).toEqual([taskFile]);
            expect(lockedScripts(diagram).at(-1)).toEqual([]);
            expect(streamedContents(diagram)).toEqual([]);
            expect(scriptTabs.editorOfTab(taskFile)).toBeUndefined();
        });

        it.each([
            { change: "a script with no tab", editor: "diagram", elementId: "Task_2" },
            {
                change: "the same script of another diagram",
                editor: "otherDiagram",
                elementId: "Task_1",
            },
        ] as const)("leaves the tabs alone for $change", async ({ editor, elementId }) => {
            const setup = createService();
            await setup.scriptTabs.open(setup.diagram.id, scriptTask());

            await setup.scriptTabs.applyModelChange(setup[editor].id, {
                ...scriptTask({ elementId }),
                content: undefined,
            });

            expect(setup.scriptEditor.closedTabs).toEqual([]);
            expect(setup.scriptEditor.contentUpdates).toEqual([]);
        });
    });

    describe("what the user does in a tab", () => {
        it("streams a burst of typing into the model as one update", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = createService();
            await scriptTabs.open(diagram.id, scriptTask());

            scriptEditor.typeByUser(taskFile, "a");
            scriptEditor.typeByUser(taskFile, "ab");
            await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

            expect(streamedContents(diagram)).toEqual(["ab"]);
        });

        it("streams nothing from a tab it does not track", async () => {
            const { diagram, scriptEditor, taskFile } = createService();

            scriptEditor.typeByUser(taskFile, "a");
            await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

            expect(streamedContents(diagram)).toEqual([]);
        });

        it("streams the last edit of a closed tab, then forgets the tab and unlocks its field", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = createService();
            await scriptTabs.open(diagram.id, scriptTask());
            scriptEditor.typeByUser(taskFile, "last");

            await scriptEditor.closeTabByUser(taskFile);

            expect(streamedContents(diagram)).toEqual(["last"]);
            expect(lockedScripts(diagram).at(-1)).toEqual([]);
            await expect(scriptTabs.materialize(diagram.id, scriptTask())).resolves.toEqual({
                kind: "written",
            });
        });

        it("adopts a script file the user opens from its editor's script folder", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = createService();
            await scriptTabs.materialize(diagram.id, scriptTask());

            await scriptEditor.openFileByUser(taskFile);
            scriptEditor.typeByUser(taskFile, "typed");
            await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

            expect(scriptEditor.adopted).toEqual([taskFile]);
            expect(lockedScripts(diagram)).toEqual([["Task_1.groovy"]]);
            expect(streamedContents(diagram)).toEqual(["typed"]);
        });

        it.each([
            {
                file: "outside the script folder",
                folder: "/work/docs/tmp/scripting",
                hashOf: DIAGRAM,
            },
            { file: "of no live editor", folder: BASE_DIR, hashOf: "file:///work/closed.bpmn" },
        ])("ignores a file $file", async ({ folder, hashOf }) => {
            const { diagram, scriptEditor, host } = createService();
            const hash = ScriptUri.hashEditorId(hashOf.startsWith("/") ? diagram.id : hashOf);
            const filePath = `${folder}/${hash}/Task_1/script-task/Task_1.groovy`;
            await host.workspace.writeFile(filePath, "x");

            await scriptEditor.openFileByUser(filePath);

            expect(scriptEditor.adopted).toEqual([]);
            expect(lockedScripts(diagram)).toEqual([]);
        });

        it("adopts no file whose script already has a tab", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = createService();
            await scriptTabs.open(diagram.id, scriptTask());

            await scriptEditor.openFileByUser(taskFile);

            expect(scriptEditor.adopted).toEqual([]);
            expect(lockedScripts(diagram)).toEqual([["Task_1.groovy"]]);
        });

        it("logs a file the host cannot adopt and tracks nothing", async () => {
            const { diagram, scriptEditor, scriptTabs, host, taskFile } = createService();
            await scriptTabs.materialize(diagram.id, scriptTask());
            scriptEditor.adoptFailure = new Error("unreadable");

            await scriptEditor.openFileByUser(taskFile);

            expect(host.notifier.loggedErrors.map((error) => error.message)).toEqual([
                "unreadable",
            ]);
            expect(scriptTabs.editorOfTab(taskFile)).toBeUndefined();
            expect(lockedScripts(diagram)).toEqual([]);
        });
    });

    describe("a webview that was hidden", () => {
        async function typeWhileHidden() {
            const setup = createService();
            await setup.scriptTabs.open(setup.diagram.id, scriptTask());
            setup.diagram.hidden = true;
            setup.scriptEditor.typeByUser(setup.taskFile, "typed while hidden");
            await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);
            setup.diagram.hidden = false;
            setup.diagram.posted.length = 0;
            return setup;
        }

        it("gets the edits it missed on its reload, then locks its open scripts again", async () => {
            const { diagram, scriptTabs } = await typeWhileHidden();

            await scriptTabs.resync(diagram.id);

            expect(streamedContents(diagram)).toEqual(["typed while hidden"]);
            expect(lockedScripts(diagram).at(-1)).toEqual(["Task_1.groovy"]);
        });

        it("only locks its open scripts again on a reload with nothing missed", async () => {
            const { diagram, scriptTabs } = createService();
            await scriptTabs.open(diagram.id, scriptTask());
            diagram.posted.length = 0;

            await scriptTabs.resync(diagram.id);

            expect(streamedContents(diagram)).toEqual([]);
            expect(lockedScripts(diagram)).toEqual([["Task_1.groovy"]]);
        });

        it("keeps a tab closed meanwhile until the reload replayed it, then forgets it", async () => {
            const { diagram, scriptEditor, scriptTabs, taskFile } = await typeWhileHidden();
            await scriptEditor.closeTabByUser(taskFile);
            expect(scriptTabs.editorOfTab(taskFile)).toBe(diagram.id);

            await scriptTabs.resync(diagram.id);

            expect(streamedContents(diagram)).toEqual(["typed while hidden"]);
            expect(scriptTabs.editorOfTab(taskFile)).toBeUndefined();
            expect(lockedScripts(diagram).at(-1)).toEqual([]);
        });

        it("replays again on the next reload when it hid again before the replay", async () => {
            const { diagram, scriptTabs } = await typeWhileHidden();
            diagram.hidden = true;
            await scriptTabs.resync(diagram.id);
            diagram.hidden = false;

            await scriptTabs.resync(diagram.id);

            expect(streamedContents(diagram)).toEqual(["typed while hidden"]);
        });
    });

    it("hands the editor's changed process variables to its own tabs", async () => {
        const { diagram, otherDiagram, scriptEditor, scriptTabs, taskFile } = createService();
        await scriptTabs.open(diagram.id, scriptTask());
        await scriptTabs.open(otherDiagram.id, scriptTask());

        scriptTabs.variablesChanged(diagram.id);

        expect(scriptEditor.variablePushes).toEqual([{ editorId: diagram.id, script: [taskFile] }]);
    });

    describe("a closed editor", () => {
        it("closes its own tabs and forgets them, and keeps another editor's", async () => {
            const { diagram, otherDiagram, scriptEditor, scriptTabs, taskFile } = createService();
            await scriptTabs.open(diagram.id, scriptTask());
            await scriptTabs.open(otherDiagram.id, scriptTask());

            scriptTabs.disposeEditor(diagram.id);

            expect(scriptEditor.closedEditors).toEqual([diagram.id]);
            expect(scriptTabs.editorOfTab(taskFile)).toBeUndefined();
            await expect(scriptTabs.materialize(otherDiagram.id, scriptTask())).resolves.toEqual({
                kind: "alreadyOpen",
            });
        });

        it.each([
            { host: "whose webview is gone by then", flushEditsOnEditorClose: false, streamed: [] },
            {
                host: "whose webview still takes the last edit",
                flushEditsOnEditorClose: true,
                streamed: ["last"],
            },
        ])(
            "drops or streams the edit still waiting, for a host $host",
            async ({ flushEditsOnEditorClose, streamed }) => {
                const { diagram, scriptEditor, scriptTabs, taskFile } = createService({
                    flushEditsOnEditorClose,
                });
                await scriptTabs.open(diagram.id, scriptTask());
                scriptEditor.typeByUser(taskFile, "last");

                scriptTabs.disposeEditor(diagram.id);
                await vi.advanceTimersByTimeAsync(SCRIPT_STREAM_DEBOUNCE_MS);

                expect(streamedContents(diagram)).toEqual(streamed);
            },
        );
    });
});
