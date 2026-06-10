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
    SetClipboardCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";

import {
    getBpmnFileHandler,
    getBpmnModelerSettingHandler,
    getClipboardHandler,
    getElementTemplatesHandler,
    getPropertiesPanelStateHandler,
    getTextClipboardHandler,
    openScriptEditorHandler,
    resyncScriptTasksHandler,
    setClipboardHandler,
    setPropertiesPanelStateHandler,
    setTextClipboardHandler,
    syncDocumentHandler,
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
        const notifier = { logInfo: vi.fn() };

        await getBpmnFileHandler(bpmnService as never, notifier as never)(ANY, EDITOR);

        expect(bpmnService.display).toHaveBeenCalledWith(EDITOR);
        expect(notifier.logInfo).toHaveBeenCalledOnce();
    });

    it("does not log when rendering was skipped", async () => {
        const bpmnService = { display: vi.fn().mockResolvedValue(false) };
        const notifier = { logInfo: vi.fn() };

        await getBpmnFileHandler(bpmnService as never, notifier as never)(ANY, EDITOR);

        expect(notifier.logInfo).not.toHaveBeenCalled();
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
    it("reloads open inline scripts for the editor", () => {
        const svc = { resyncOpenDocuments: vi.fn() };
        resyncScriptTasksHandler(svc as never)(ANY, EDITOR);
        expect(svc.resyncOpenDocuments).toHaveBeenCalledWith(EDITOR);
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

        await openScriptEditorHandler(scriptTaskSvc as never)(
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
});
