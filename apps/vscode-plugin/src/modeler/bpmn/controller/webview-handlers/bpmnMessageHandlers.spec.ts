import { beforeEach, describe, expect, it, vi } from "vitest";

// Importing the handler module pulls in `VsCodeNotifier`/`EditorSessionStore`,
// which reference vscode; a bare stub is enough since the handlers under test
// only ever touch their injected service doubles.
vi.mock("vscode", () => ({
    Uri: { file: (path: string) => ({ scheme: "file", path, fsPath: path }) },
}));

import {
    Command,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    SetClipboardCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
    UpdateLintResultsCommand,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";

import {
    getBpmnFileHandler,
    getBpmnlintConfigHandler,
    getBpmnModelerSettingHandler,
    getClipboardHandler,
    getElementTemplatesHandler,
    getPropertiesPanelStateHandler,
    getTextClipboardHandler,
    openScriptEditorHandler,
    openScriptEditorsHandler,
    resyncScriptTasksHandler,
    setClipboardHandler,
    setPropertiesPanelStateHandler,
    setTextClipboardHandler,
    syncDocumentHandler,
    updateLintResultsHandler,
    updateScriptSourceHandler,
    updateScriptVariablesHandler,
} from "./bpmnMessageHandlers";

const EDITOR = "file:///work/diagram.bpmn";
// Commands the read-style handlers ignore; a typed placeholder keeps signatures honest.
const ANY: Command = { type: "Ignored" } as Command;

beforeEach(() => {
    vi.clearAllMocks();
});

describe("getBpmnFileHandler", () => {
    it("logs readiness only when the diagram actually rendered", async () => {
        const bpmnService = { display: vi.fn().mockResolvedValue(true) };
        const notifier = { logDebug: vi.fn() };

        await getBpmnFileHandler(bpmnService as never, notifier as never)(ANY, EDITOR);

        expect(bpmnService.display).toHaveBeenCalledWith(EDITOR);
        expect(notifier.logDebug).toHaveBeenCalledOnce();
    });

    it("does not log when rendering was skipped", async () => {
        const bpmnService = { display: vi.fn().mockResolvedValue(false) };
        const notifier = { logDebug: vi.fn() };

        await getBpmnFileHandler(bpmnService as never, notifier as never)(ANY, EDITOR);

        expect(notifier.logDebug).not.toHaveBeenCalled();
    });
});

describe("read-style handlers forward the editor id", () => {
    it("getElementTemplatesHandler → setElementTemplates", () => {
        const svc = { setElementTemplates: vi.fn() };
        getElementTemplatesHandler(svc as never)(ANY, EDITOR);
        expect(svc.setElementTemplates).toHaveBeenCalledWith(EDITOR);
    });

    it("getPropertiesPanelStateHandler → sendPropertiesPanelState", () => {
        const svc = { sendPropertiesPanelState: vi.fn() };
        getPropertiesPanelStateHandler(svc as never)(ANY, EDITOR);
        expect(svc.sendPropertiesPanelState).toHaveBeenCalledWith(EDITOR);
    });

    it("getClipboardHandler → readClipboard", () => {
        const svc = { readClipboard: vi.fn() };
        getClipboardHandler(svc as never)(ANY, EDITOR);
        expect(svc.readClipboard).toHaveBeenCalledWith(EDITOR);
    });

    it("getTextClipboardHandler → readTextClipboard", () => {
        const svc = { readTextClipboard: vi.fn() };
        getTextClipboardHandler(svc as never)(ANY, EDITOR);
        expect(svc.readTextClipboard).toHaveBeenCalledWith(EDITOR);
    });
});

describe("getBpmnModelerSettingHandler", () => {
    it("broadcasts both settings and language", () => {
        const broadcaster = { setSettings: vi.fn(), setLanguage: vi.fn() };

        getBpmnModelerSettingHandler(broadcaster as never)(ANY, EDITOR);

        expect(broadcaster.setSettings).toHaveBeenCalledWith(EDITOR);
        expect(broadcaster.setLanguage).toHaveBeenCalledWith(EDITOR);
    });
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

describe("set-style handlers forward the command payload", () => {
    it("setPropertiesPanelStateHandler → setPropertiesPanelVisibility(visible)", () => {
        const svc = { setPropertiesPanelVisibility: vi.fn() };
        setPropertiesPanelStateHandler(svc as never)(
            new SetPropertiesPanelStateCommand(true),
            EDITOR,
        );
        expect(svc.setPropertiesPanelVisibility).toHaveBeenCalledWith(true);
    });

    it("setClipboardHandler → writeClipboard(text)", () => {
        const svc = { writeClipboard: vi.fn() };
        setClipboardHandler(svc as never)(new SetClipboardCommand("payload"), EDITOR);
        expect(svc.writeClipboard).toHaveBeenCalledWith("payload");
    });

    it("setTextClipboardHandler → writeClipboard(text)", () => {
        const svc = { writeClipboard: vi.fn() };
        setTextClipboardHandler(svc as never)(new SetTextClipboardCommand("plain"), EDITOR);
        expect(svc.writeClipboard).toHaveBeenCalledWith("plain");
    });

    it("syncDocumentHandler → sync(editorId, content)", async () => {
        const bpmnService = { sync: vi.fn().mockResolvedValue(true) };
        await syncDocumentHandler(bpmnService as never)(new SyncDocumentCommand("<xml/>"), EDITOR);
        expect(bpmnService.sync).toHaveBeenCalledWith(EDITOR, "<xml/>");
    });
});

describe("openScriptEditorHandler", () => {
    it("maps every command field to the script-task service, in order", async () => {
        const scriptTaskSvc = { openScriptEditor: vi.fn().mockResolvedValue(undefined) };
        const variableStore = { setExtracted: vi.fn() };

        await openScriptEditorHandler(scriptTaskSvc as never, variableStore as never)(
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

        await openScriptEditorHandler(scriptTaskSvc as never, variableStore as never)(
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

describe("openScriptEditorsHandler", () => {
    const script = (elementId: string, scriptFormat: string, content: string) => ({
        elementId,
        scriptFormat,
        content,
    });

    // The command only writes files; `.camunda` is the config folder the
    // completion notification names, joined with the `tmp/scripting` segment.
    const CONFIG_FOLDER = ".camunda";
    const FOLDER = ".camunda/tmp/scripting";

    it("materializes scripts strictly sequentially, awaiting each before the next", async () => {
        // A deferred first materialize lets us prove the second never starts
        // until the first resolves — the ordering guarantee the bulk handler
        // exists for (a parallel loop would stack the per-script format pickers).
        let resolveFirst!: (result: { path: string; written: boolean }) => void;
        const materializeScript = vi
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<{ path: string; written: boolean }>(
                        (resolve) => (resolveFirst = resolve),
                    ),
            )
            .mockResolvedValue({ path: "B", written: true });
        const scriptTaskSvc = { materializeScript };
        const variableStore = { setExtracted: vi.fn() };
        const settings = { getConfigFolder: () => CONFIG_FOLDER };
        const notifier = { showInfo: vi.fn() };
        const variables = [{ name: "amount", origin: "form field", confidence: "declared" }];

        const done = openScriptEditorsHandler(
            scriptTaskSvc as never,
            variableStore as never,
            settings as never,
            notifier as never,
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

        resolveFirst({ path: "A", written: true });
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
        expect(notifier.showInfo).toHaveBeenCalledTimes(1);
        expect(notifier.showInfo).toHaveBeenCalledWith(
            `Generated 2 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram.`,
        );
    });

    it("shows an info message and materializes nothing for an empty batch", async () => {
        const scriptTaskSvc = { materializeScript: vi.fn() };
        const variableStore = { setExtracted: vi.fn() };
        const settings = { getConfigFolder: () => CONFIG_FOLDER };
        const notifier = { showInfo: vi.fn() };

        await openScriptEditorsHandler(
            scriptTaskSvc as never,
            variableStore as never,
            settings as never,
            notifier as never,
        )(new OpenScriptEditorsCommand([], []), EDITOR);

        expect(notifier.showInfo).toHaveBeenCalledTimes(1);
        expect(notifier.showInfo).toHaveBeenCalledWith(
            "No script tasks with inline scripts found in this diagram.",
        );
        expect(scriptTaskSvc.materializeScript).not.toHaveBeenCalled();
        expect(variableStore.setExtracted).not.toHaveBeenCalled();
    });

    it("reports the already-open count when a script was left untouched", async () => {
        // One fresh write + one already-open tab (written:false): the completion
        // notification must name the skipped count so the user knows one file
        // wasn't overwritten.
        const materializeScript = vi
            .fn()
            .mockResolvedValueOnce({ path: "A", written: true })
            .mockResolvedValueOnce({ path: "B", written: false });
        const scriptTaskSvc = { materializeScript };
        const variableStore = { setExtracted: vi.fn() };
        const settings = { getConfigFolder: () => CONFIG_FOLDER };
        const notifier = { showInfo: vi.fn() };

        await openScriptEditorsHandler(
            scriptTaskSvc as never,
            variableStore as never,
            settings as never,
            notifier as never,
        )(
            new OpenScriptEditorsCommand(
                [script("A", "groovy", "a=1"), script("B", "groovy", "b=2")],
                [],
            ),
            EDITOR,
        );

        expect(notifier.showInfo).toHaveBeenCalledWith(
            `Generated 1 script file(s) in ${FOLDER} (1 already open, left untouched) — open a file to edit it with live sync into the diagram.`,
        );
    });

    it("counts a cancelled picker as neither written nor already open", async () => {
        // materializeScript returns undefined when the language picker is
        // cancelled: it must not inflate either counter.
        const materializeScript = vi
            .fn()
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({ path: "B", written: true });
        const scriptTaskSvc = { materializeScript };
        const variableStore = { setExtracted: vi.fn() };
        const settings = { getConfigFolder: () => CONFIG_FOLDER };
        const notifier = { showInfo: vi.fn() };

        await openScriptEditorsHandler(
            scriptTaskSvc as never,
            variableStore as never,
            settings as never,
            notifier as never,
        )(
            new OpenScriptEditorsCommand(
                [script("A", "cobol", "a=1"), script("B", "groovy", "b=2")],
                [],
            ),
            EDITOR,
        );

        expect(notifier.showInfo).toHaveBeenCalledWith(
            `Generated 1 script file(s) in ${FOLDER} — open a file to edit it with live sync into the diagram.`,
        );
    });
});

describe("Pattern B: a rejecting service promise propagates through the handler", () => {
    // The router awaits each handler and ModelerEditorController's dispatch catch
    // logs a rejection — but only if the handler actually returns/awaits the
    // service promise instead of dropping it on the floor.
    const boom = new Error("service failed");

    it("getElementTemplatesHandler rejects when setElementTemplates rejects", async () => {
        const svc = { setElementTemplates: vi.fn().mockRejectedValue(boom) };
        await expect(getElementTemplatesHandler(svc as never)(ANY, EDITOR)).rejects.toThrow(boom);
    });

    it("getBpmnlintConfigHandler rejects when setBpmnlintConfig rejects", async () => {
        const svc = { setBpmnlintConfig: vi.fn().mockRejectedValue(boom) };
        await expect(getBpmnlintConfigHandler(svc as never)(ANY, EDITOR)).rejects.toThrow(boom);
    });

    it("resyncScriptTasksHandler rejects when resyncOpenDocuments rejects", async () => {
        const svc = { resyncOpenDocuments: vi.fn().mockRejectedValue(boom) };
        await expect(resyncScriptTasksHandler(svc as never)(ANY, EDITOR)).rejects.toThrow(boom);
    });

    it("getBpmnModelerSettingHandler rejects when setSettings rejects, still setting language", async () => {
        const broadcaster = {
            setSettings: vi.fn().mockRejectedValue(boom),
            setLanguage: vi.fn(),
        };

        await expect(
            getBpmnModelerSettingHandler(broadcaster as never)(ANY, EDITOR),
        ).rejects.toThrow(boom);
        // Language is posted before settings is awaited, so it still fires.
        expect(broadcaster.setLanguage).toHaveBeenCalledWith(EDITOR);
    });
});

describe("updateLintResultsHandler", () => {
    it("forwards the webview's in-page findings to applyWebviewLintResults", () => {
        const lintSvc = { applyWebviewLintResults: vi.fn() };
        const results = {
            "label-required": [{ id: "Task_1", message: "needs a label", category: "warn" }],
        };
        const unresolved = ["some-plugin/some-rule"];

        updateLintResultsHandler(lintSvc as never)(
            new UpdateLintResultsCommand(results, unresolved),
            EDITOR,
        );

        expect(lintSvc.applyWebviewLintResults).toHaveBeenCalledWith(
            EDITOR,
            results,
            unresolved,
            undefined,
        );
    });

    it("forwards the config token so the service can pair the run with its config version (#1384)", () => {
        const lintSvc = { applyWebviewLintResults: vi.fn() };
        const results = {};

        updateLintResultsHandler(lintSvc as never)(
            new UpdateLintResultsCommand(results, [], "lint-cfg-7"),
            EDITOR,
        );

        expect(lintSvc.applyWebviewLintResults).toHaveBeenCalledWith(
            EDITOR,
            results,
            [],
            "lint-cfg-7",
        );
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
