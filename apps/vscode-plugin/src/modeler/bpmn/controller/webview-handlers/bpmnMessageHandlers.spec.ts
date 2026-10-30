import { beforeEach, describe, expect, it, vi } from "vitest";

// The handler module imports vscode for the linting switch; a bare stub is
// enough since the handlers under test only touch their injected doubles.
vi.mock("vscode", () => ({
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
}));

import {
    Command,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";
import {
    ArtifactService,
    ScriptFileStore,
    type ScriptMaterialization,
} from "@miragon/bpmn-modeler-core";
import {
    createTestHost,
    FakeEditorHandle,
    RecordingNotifier,
} from "@miragon/bpmn-modeler-core/testing";

import {
    openScriptEditorHandler,
    openScriptEditorsHandler,
    resyncScriptTasksHandler,
    updateScriptSourceHandler,
    updateScriptVariablesHandler,
} from "./bpmnMessageHandlers";

const EDITOR = "file:///work/diagram.bpmn";
// Commands the read-style handlers ignore; a typed placeholder keeps signatures honest.
const ANY: Command = { type: "Ignored" } as Command;

const UNTITLED_EDITOR = "untitled://Untitled-1";

/**
 * The store the batch summary names its folder from, holding the base dirs of
 * `resolvedFor` as a real script write would have left them.
 */
async function createScriptFiles(resolvedFor: string[]): Promise<ScriptFileStore> {
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
    return scriptFiles;
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("resyncScriptTasksHandler", () => {
    it("reloads open inline scripts then re-broadcasts the lock state", async () => {
        const svc = {
            resyncOpenDocuments: vi.fn().mockResolvedValue(undefined),
            syncLockState: vi.fn(),
        };
        await resyncScriptTasksHandler(svc as never)(ANY, EDITOR);
        expect(svc.resyncOpenDocuments).toHaveBeenCalledWith(EDITOR);
        expect(svc.syncLockState).toHaveBeenCalledWith(EDITOR);
    });
});

describe("openScriptEditorHandler", () => {
    it("maps every command field to the script-task service, in order", async () => {
        const scriptTaskSvc = { openScriptEditor: vi.fn().mockResolvedValue(undefined) };
        const variableStore = { setExtracted: vi.fn() };

        await openScriptEditorHandler(
            scriptTaskSvc as never,
            variableStore as never,
            new RecordingNotifier(),
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

        expect(scriptTaskSvc.openScriptEditor).toHaveBeenCalledWith(
            EDITOR,
            "Element_1",
            "execution-listener",
            2,
            "start",
            "javascript",
            "x=1",
        );
    });

    it("seeds the variable store from the command before opening", async () => {
        const scriptTaskSvc = { openScriptEditor: vi.fn().mockResolvedValue(undefined) };
        const variableStore = { setExtracted: vi.fn() };
        const variables = [{ name: "amount", origin: "form field", confidence: "declared" }];

        await openScriptEditorHandler(
            scriptTaskSvc as never,
            variableStore as never,
            new RecordingNotifier(),
        )(
            new OpenScriptEditorCommand(
                "Element_1",
                "script-task",
                undefined,
                undefined,
                "groovy",
                "",
                variables as never,
            ),
            EDITOR,
        );

        expect(variableStore.setExtracted).toHaveBeenCalledWith(EDITOR, variables);
    });
});

describe("openScriptEditorHandler when the open fails", () => {
    it("logs the failure with the element it was for", async () => {
        const scriptTaskSvc = {
            openScriptEditor: vi.fn().mockRejectedValue(new Error("host went away")),
        };
        const notifier = new RecordingNotifier();

        await expect(
            openScriptEditorHandler(
                scriptTaskSvc as never,
                { setExtracted: vi.fn() } as never,
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
    const script = (elementId: string, scriptFormat: string, content: string) => ({
        elementId,
        scriptFormat,
        content,
    });

    const FOLDER = ".camunda/tmp/scripting";

    it("materializes scripts strictly sequentially, awaiting each before the next", async () => {
        // A deferred first materialize lets us prove the second never starts
        // until the first resolves — the ordering guarantee the bulk handler
        // exists for (a parallel loop would stack the per-script format pickers).
        let resolveFirst!: (result: ScriptMaterialization) => void;
        const materializeScript = vi
            .fn()
            .mockImplementationOnce(
                () => new Promise<ScriptMaterialization>((resolve) => (resolveFirst = resolve)),
            )
            .mockResolvedValue({ kind: "written" });
        const scriptTaskSvc = { materializeScript };
        const variableStore = { setExtracted: vi.fn() };
        const scriptFiles = await createScriptFiles([EDITOR]);
        const notifier = new RecordingNotifier();
        const variables = [{ name: "amount", origin: "form field", confidence: "declared" }];

        const done = openScriptEditorsHandler(
            scriptTaskSvc as never,
            variableStore as never,
            scriptFiles,
            notifier,
        )(
            new OpenScriptEditorsCommand(
                [script("A", "javascript", "a=1"), script("B", "groovy", "b=2")],
                variables as never,
            ),
            EDITOR,
        );

        // Variables seeded once, before any materialize; the second is still gated.
        expect(variableStore.setExtracted).toHaveBeenCalledTimes(1);
        expect(variableStore.setExtracted).toHaveBeenCalledWith(EDITOR, variables);
        expect(materializeScript).toHaveBeenCalledTimes(1);
        expect(materializeScript).toHaveBeenNthCalledWith(
            1,
            EDITOR,
            "A",
            "script-task",
            undefined,
            undefined,
            "javascript",
            "a=1",
        );

        resolveFirst({ kind: "written" });
        await done;

        expect(materializeScript).toHaveBeenCalledTimes(2);
        expect(materializeScript).toHaveBeenNthCalledWith(
            2,
            EDITOR,
            "B",
            "script-task",
            undefined,
            undefined,
            "groovy",
            "b=2",
        );
        // Both written, none already open → no skipped suffix.
        expect(notifier.infos).toEqual([
            `Generated 2 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram.`,
        ]);
    });

    it("shows an info message and materializes nothing for an empty batch", async () => {
        const scriptTaskSvc = { materializeScript: vi.fn() };
        const variableStore = { setExtracted: vi.fn() };
        const scriptFiles = await createScriptFiles([EDITOR]);
        const notifier = new RecordingNotifier();

        await openScriptEditorsHandler(
            scriptTaskSvc as never,
            variableStore as never,
            scriptFiles,
            notifier,
        )(new OpenScriptEditorsCommand([], []), EDITOR);

        expect(notifier.infos).toEqual([
            "No script tasks with inline scripts found in this diagram.",
        ]);
        expect(scriptTaskSvc.materializeScript).not.toHaveBeenCalled();
        expect(variableStore.setExtracted).not.toHaveBeenCalled();
    });

    it("reports the already-open count when a script was left untouched", async () => {
        // One fresh write + one already-open tab: the completion notification
        // must name the skipped count so the user knows one file wasn't
        // overwritten.
        const materializeScript = vi
            .fn()
            .mockResolvedValueOnce({ kind: "written" })
            .mockResolvedValueOnce({ kind: "alreadyOpen" });
        const scriptTaskSvc = { materializeScript };
        const variableStore = { setExtracted: vi.fn() };
        const scriptFiles = await createScriptFiles([EDITOR]);
        const notifier = new RecordingNotifier();

        await openScriptEditorsHandler(
            scriptTaskSvc as never,
            variableStore as never,
            scriptFiles,
            notifier,
        )(
            new OpenScriptEditorsCommand(
                [script("A", "groovy", "a=1"), script("B", "groovy", "b=2")],
                [],
            ),
            EDITOR,
        );

        expect(notifier.infos).toEqual([
            `Generated 1 script file(s) in ${FOLDER} (1 already open, left untouched) — open a file to edit it with live sync into the diagram.`,
        ]);
    });

    it("counts a cancelled picker as neither written nor already open", async () => {
        const materializeScript = vi
            .fn()
            .mockResolvedValueOnce({ kind: "cancelled" })
            .mockResolvedValueOnce({ kind: "written" });
        const scriptTaskSvc = { materializeScript };
        const variableStore = { setExtracted: vi.fn() };
        const scriptFiles = await createScriptFiles([EDITOR]);
        const notifier = new RecordingNotifier();

        await openScriptEditorsHandler(
            scriptTaskSvc as never,
            variableStore as never,
            scriptFiles,
            notifier,
        )(
            new OpenScriptEditorsCommand(
                [script("A", "cobol", "a=1"), script("B", "groovy", "b=2")],
                [],
            ),
            EDITOR,
        );

        expect(notifier.infos).toEqual([
            `Generated 1 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram.`,
        ]);
    });

    it("counts a failed script write in the summary and still writes the rest", async () => {
        const materializeScript = vi
            .fn()
            .mockResolvedValueOnce({ kind: "written" })
            .mockRejectedValueOnce(new Error("EACCES: permission denied"))
            .mockResolvedValueOnce({ kind: "written" });
        const scriptTaskSvc = { materializeScript };
        const variableStore = { setExtracted: vi.fn() };
        const scriptFiles = await createScriptFiles([EDITOR]);
        const notifier = new RecordingNotifier();

        await expect(
            openScriptEditorsHandler(
                scriptTaskSvc as never,
                variableStore as never,
                scriptFiles,
                notifier,
            )(
                new OpenScriptEditorsCommand(
                    [
                        script("A", "groovy", "a=1"),
                        script("B", "groovy", "b=2"),
                        script("C", "groovy", "c=3"),
                    ],
                    [],
                ),
                EDITOR,
            ),
        ).resolves.toBeUndefined();

        expect(materializeScript).toHaveBeenCalledTimes(3);
        expect(notifier.infos).toEqual([
            `Generated 2 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram. Could not write 1 script file(s); see the log for details.`,
        ]);
        expect(notifier.logged("error")).toEqual([
            expect.stringMatching(
                /^Could not write the script file of B: Error: EACCES: permission denied/,
            ),
        ]);
    });
});

describe("openScriptEditorsHandler names the folder the scripts went to", () => {
    const written = (): Promise<ScriptMaterialization> => Promise.resolve({ kind: "written" });

    async function summaryFor(
        editorId: string,
        resolvedFor: string[],
        materializeScript: () => Promise<ScriptMaterialization>,
    ): Promise<string[]> {
        const notifier = new RecordingNotifier();

        await openScriptEditorsHandler(
            { materializeScript } as never,
            { setExtracted: vi.fn() } as never,
            await createScriptFiles(resolvedFor),
            notifier,
        )(
            new OpenScriptEditorsCommand(
                [{ elementId: "A", scriptFormat: "groovy", content: "" }],
                [],
            ),
            editorId,
        );
        return notifier.infos;
    }

    it("names the OS temp folder for a diagram that is not a file", async () => {
        expect(await summaryFor(UNTITLED_EDITOR, [UNTITLED_EDITOR], written)).toEqual([
            "Generated 1 script file(s) in /tmp/miragon-bpmn-modeler/tmp/scripting — open a file to edit it with live sync into the diagram.",
        ]);
    });

    it("names no folder when no script got as far as resolving one", async () => {
        const cancelled = (): Promise<ScriptMaterialization> =>
            Promise.resolve({ kind: "cancelled" });

        expect(await summaryFor(EDITOR, [], cancelled)).toEqual(["No script files generated."]);
    });
});

describe("Pattern B: a rejecting service promise propagates through the handler", () => {
    // The router awaits each handler and the session lifecycle logs a rejection — but only if the handler actually returns/awaits the
    // service promise instead of dropping it on the floor.
    const boom = new Error("service failed");

    it("resyncScriptTasksHandler rejects when resyncOpenDocuments rejects", async () => {
        const svc = { resyncOpenDocuments: vi.fn().mockRejectedValue(boom) };
        await expect(resyncScriptTasksHandler(svc as never)(ANY, EDITOR)).rejects.toThrow(boom);
    });
});

describe("updateScriptVariablesHandler", () => {
    it("replaces the editor's variable model in the store", () => {
        const variableStore = { setExtracted: vi.fn() };
        const variables = [{ name: "total", origin: "output mapping", confidence: "declared" }];

        updateScriptVariablesHandler(variableStore as never)(
            new UpdateScriptVariablesCommand(variables as never),
            EDITOR,
        );

        expect(variableStore.setExtracted).toHaveBeenCalledWith(EDITOR, variables);
    });
});

describe("updateScriptSourceHandler", () => {
    it("forwards a model-side content change to applyModelChange", async () => {
        const scriptTaskSvc = { applyModelChange: vi.fn().mockResolvedValue(undefined) };

        await updateScriptSourceHandler(scriptTaskSvc as never)(
            new UpdateScriptSourceCommand("Task_1", "script-task", undefined, "undone"),
            EDITOR,
        );

        expect(scriptTaskSvc.applyModelChange).toHaveBeenCalledWith(
            EDITOR,
            "Task_1",
            "script-task",
            undefined,
            "undone",
        );
    });

    it("forwards the deletion signal (undefined content) unchanged", async () => {
        const scriptTaskSvc = { applyModelChange: vi.fn().mockResolvedValue(undefined) };

        await updateScriptSourceHandler(scriptTaskSvc as never)(
            new UpdateScriptSourceCommand("Task_1", "script-task", undefined, undefined),
            EDITOR,
        );

        expect(scriptTaskSvc.applyModelChange).toHaveBeenCalledWith(
            EDITOR,
            "Task_1",
            "script-task",
            undefined,
            undefined,
        );
    });
});
