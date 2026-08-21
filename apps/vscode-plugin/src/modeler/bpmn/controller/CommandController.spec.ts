import { beforeEach, describe, expect, it, vi } from "vitest";

import { GetDiagramAsSVGCommand } from "@miragon/bpmn-modeler-shared";

// The i18n-extras package declares no `main`/`exports`, so Vite cannot resolve
// its real entry under vitest. A small fixture keeps the language list
// deterministic while letting the subject's module-level import resolve. The
// literal is inlined because the mock factory is hoisted above any top-level
// binding it might close over.
vi.mock("@miragon/bpmn-modeler-i18n-extras", () => ({
    supportedModelerLanguages: [
        { label: "Deutsch", locale: "de" },
        { label: "English", locale: "en" },
    ],
}));

// Hoisted because `vi.mock` is hoisted above imports; the factory closes over
// these so each test can drive the vscode surface the controller touches.
const showQuickPickMock = vi.fn();
const showSaveDialogMock = vi.fn();
const executeCommandMock = vi.fn();
const clipboardWriteTextMock = vi.fn();
const configUpdateMock = vi.fn();
const getConfigurationMock = vi.fn((_section: string) => ({ update: configUpdateMock }));
const fsWriteFileMock = vi.fn();
const uriFileMock = vi.fn((path: string) => ({ scheme: "file", path, fsPath: path }));
// Mutable so tests can toggle "no folder open" vs. a folder-backed default URI.
const workspaceState: { folders: readonly { uri: unknown }[] | undefined } = { folders: undefined };

/**
 * Minimal `Uri`-like fake: enough `path`/`with` surface for the new-model
 * commands, which build a save target and re-suffix it when the dialog omits
 * the extension.
 */
function fakeUri(path: string): {
    scheme: string;
    path: string;
    fsPath: string;
    with: (change: { path: string }) => ReturnType<typeof fakeUri>;
} {
    return {
        scheme: "file",
        path,
        fsPath: path,
        with: (change) => fakeUri(change.path),
    };
}

vi.mock("vscode", () => ({
    commands: {
        registerCommand: vi.fn(),
        executeCommand: (...args: unknown[]) => executeCommandMock(...args),
    },
    window: {
        showQuickPick: (...args: unknown[]) => showQuickPickMock(...args),
        showSaveDialog: (...args: unknown[]) => showSaveDialogMock(...args),
    },
    workspace: {
        get workspaceFolders() {
            return workspaceState.folders;
        },
        getConfiguration: (...args: unknown[]) => getConfigurationMock(...(args as [string])),
        fs: { writeFile: (...args: unknown[]) => fsWriteFileMock(...args) },
    },
    env: { clipboard: { writeText: (...args: unknown[]) => clipboardWriteTextMock(...args) } },
    Uri: {
        file: (path: string) => uriFileMock(path),
        joinPath: (base: { path: string }, ...segments: string[]) =>
            fakeUri(`${base.path}/${segments.join("/")}`),
    },
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
}));

import { supportedModelerLanguages } from "@miragon/bpmn-modeler-i18n-extras";
import { getLatestVersion, UserCancelledError } from "@miragon/bpmn-modeler-core";

import { CommandController } from "./CommandController";

/**
 * Assembles the controller over bare port doubles. `subscribeToActiveEditorMessage`
 * captures the live callback into `captured.onMessage` and hands back a disposable
 * spy, so tests can both drive a simulated webview reply and assert the
 * subscription's dispose lifecycle.
 */
function createController() {
    const captured: { onMessage?: (message: unknown) => void } = {};
    const subscriptionDisposes: ReturnType<typeof vi.fn>[] = [];

    const editorStore = {
        getActiveEditorId: vi.fn().mockReturnValue("editor-1"),
        postMessage: vi.fn().mockResolvedValue(true),
        reload: vi.fn(),
        subscribeToActiveEditorMessage: vi.fn((cb: (message: unknown) => void) => {
            captured.onMessage = cb;
            const dispose = vi.fn();
            subscriptionDisposes.push(dispose);
            return { dispose };
        }),
    };
    const vsDocument = { getFilePath: vi.fn().mockReturnValue("/work/diagram.bpmn") };
    const notifier = { openLoggingConsole: vi.fn(), logError: vi.fn(), logInfo: vi.fn() };
    const textEditor = { toggle: vi.fn().mockResolvedValue(true) };
    const bpmnService = { changeEngineVersion: vi.fn().mockResolvedValue(true) };
    const migrationSvc = { migrateAllDiagrams: vi.fn().mockResolvedValue(true) };
    const picker = { pickExecutionPlatform: vi.fn() };

    const controller = new CommandController(
        editorStore as never,
        vsDocument as never,
        notifier as never,
        textEditor as never,
        bpmnService as never,
        migrationSvc as never,
        picker as never,
    );

    return {
        controller,
        editorStore,
        vsDocument,
        notifier,
        textEditor,
        bpmnService,
        migrationSvc,
        picker,
        captured,
        subscriptionDisposes,
    };
}

// Builds the SVG reply the webview posts back through the subscription.
function svgReply(svg?: string): GetDiagramAsSVGCommand {
    const cmd = new GetDiagramAsSVGCommand();
    cmd.svg = svg;
    return cmd;
}

beforeEach(() => {
    vi.clearAllMocks();
    workspaceState.folders = undefined;
});

describe("CommandController.toggle", () => {
    it("toggles the text editor for the active document's path", async () => {
        const { controller, editorStore, vsDocument, textEditor } = createController();

        await controller.toggle();

        expect(vsDocument.getFilePath).toHaveBeenCalledWith("editor-1");
        expect(textEditor.toggle).toHaveBeenCalledWith("/work/diagram.bpmn");
        expect(editorStore.getActiveEditorId).toHaveBeenCalled();
    });
});

describe("CommandController.reloadModeler", () => {
    it("reloads the active editor's webview", () => {
        const { controller, editorStore } = createController();

        controller.reloadModeler();

        expect(editorStore.reload).toHaveBeenCalledWith("editor-1");
        expect(editorStore.getActiveEditorId).toHaveBeenCalled();
    });
});

describe("CommandController.showLogging", () => {
    it("opens the logging console", () => {
        const { controller, notifier } = createController();

        controller.showLogging();

        expect(notifier.openLoggingConsole).toHaveBeenCalledOnce();
    });
});

describe("CommandController.changeEngineVersion", () => {
    it("delegates to the bpmn service for the active editor", async () => {
        const { controller, bpmnService } = createController();

        await controller.changeEngineVersion();

        expect(bpmnService.changeEngineVersion).toHaveBeenCalledWith("editor-1");
    });
});

describe("CommandController.migrateAllDiagrams", () => {
    it("delegates to the migration service", async () => {
        const { controller, migrationSvc } = createController();

        await controller.migrateAllDiagrams();

        expect(migrationSvc.migrateAllDiagrams).toHaveBeenCalledOnce();
    });
});

describe("CommandController.changeLanguage", () => {
    it("offers every supported language as a label/locale pick", async () => {
        const { controller } = createController();
        showQuickPickMock.mockResolvedValue(undefined);

        await controller.changeLanguage();

        const items = showQuickPickMock.mock.calls[0][0] as {
            label: string;
            description: string;
        }[];
        expect(items).toHaveLength(supportedModelerLanguages.length);
        expect(items[0]).toEqual({
            label: supportedModelerLanguages[0].label,
            description: supportedModelerLanguages[0].locale,
        });
    });

    it("writes nothing when the user dismisses the pick", async () => {
        const { controller } = createController();
        showQuickPickMock.mockResolvedValue(undefined);

        await controller.changeLanguage();

        expect(getConfigurationMock).not.toHaveBeenCalled();
        expect(configUpdateMock).not.toHaveBeenCalled();
    });

    it("persists the picked locale at the Global target", async () => {
        const { controller } = createController();
        showQuickPickMock.mockResolvedValue({ label: "English", description: "en" });

        await controller.changeLanguage();

        expect(getConfigurationMock).toHaveBeenCalledWith("miragon.bpmnModeler");
        // ConfigurationTarget.Global === 1 in the mock; language is a personal
        // preference and must not be pinned to a shared workspace file.
        expect(configUpdateMock).toHaveBeenCalledWith("language", "en", 1);
    });
});

describe("CommandController SVG request lifecycle", () => {
    it("posts a GetDiagramAsSVGCommand and subscribes to the active editor", () => {
        const { controller, editorStore } = createController();

        controller.writeToClipboard();

        const posted = editorStore.postMessage.mock.calls[0][1] as GetDiagramAsSVGCommand;
        expect(editorStore.postMessage).toHaveBeenCalledWith("editor-1", posted);
        expect(posted.type).toBe("GetDiagramAsSVGCommand");
        expect(editorStore.subscribeToActiveEditorMessage).toHaveBeenCalledOnce();
    });

    it("logs an error when posting the SVG request rejects", async () => {
        const { controller, editorStore, notifier } = createController();
        const failure = new Error("hidden editor");
        editorStore.postMessage.mockRejectedValueOnce(failure);

        controller.writeToClipboard();
        await Promise.resolve();

        expect(notifier.logError).toHaveBeenCalledWith(failure);
    });

    it("disposes the prior subscription before re-subscribing", () => {
        const { controller, subscriptionDisposes } = createController();

        controller.writeToClipboard();
        controller.writeToClipboard();

        // The first subscription must be torn down so listeners do not accumulate.
        expect(subscriptionDisposes[0]).toHaveBeenCalledOnce();
        expect(subscriptionDisposes).toHaveLength(2);
    });

    it("ignores messages that are not a GetDiagramAsSVGCommand", () => {
        const { controller, captured, subscriptionDisposes } = createController();
        controller.writeToClipboard();

        captured.onMessage?.({ type: "SomeOtherCommand" });

        expect(clipboardWriteTextMock).not.toHaveBeenCalled();
        // Still subscribed: the matching reply has not arrived yet.
        expect(subscriptionDisposes[0]).not.toHaveBeenCalled();
    });

    it("ignores a GetDiagramAsSVGCommand carrying an empty svg but still disposes", () => {
        const { controller, captured, subscriptionDisposes } = createController();
        controller.writeToClipboard();

        captured.onMessage?.(svgReply(""));

        expect(clipboardWriteTextMock).not.toHaveBeenCalled();
        // The response arrived, so the subscription is torn down regardless of payload.
        expect(subscriptionDisposes[0]).toHaveBeenCalledOnce();
    });
});

describe("CommandController.writeToClipboard", () => {
    it("writes the received svg to the clipboard and disposes the subscription", () => {
        const { controller, captured, subscriptionDisposes } = createController();
        controller.writeToClipboard();

        captured.onMessage?.(svgReply("<svg/>"));

        expect(clipboardWriteTextMock).toHaveBeenCalledWith("<svg/>");
        expect(subscriptionDisposes[0]).toHaveBeenCalledOnce();
    });
});

describe("CommandController.writeToFile", () => {
    it("writes the svg to a sibling .svg file and logs the export path", async () => {
        const { controller, captured, vsDocument, notifier } = createController();
        vsDocument.getFilePath.mockReturnValue("/work/diagram.bpmn");
        controller.writeToFile();

        captured.onMessage?.(svgReply("<svg/>"));
        // The write + info log run on a microtask chain; flush before asserting.
        await Promise.resolve();
        await Promise.resolve();

        expect(uriFileMock).toHaveBeenCalledWith("/work/diagram.svg");
        const [uriArg, bufferArg] = fsWriteFileMock.mock.calls[0];
        expect((uriArg as { path: string }).path).toBe("/work/diagram.svg");
        expect(Buffer.isBuffer(bufferArg)).toBe(true);
        expect((bufferArg as Buffer).toString()).toBe("<svg/>");
        expect(notifier.logInfo).toHaveBeenCalledWith("Diagram SVG exported to /work/diagram.svg");
    });

    it("logs an error when the file write rejects", async () => {
        const { controller, captured, notifier } = createController();
        const failure = new Error("EACCES");
        fsWriteFileMock.mockRejectedValueOnce(failure);
        controller.writeToFile();

        captured.onMessage?.(svgReply("<svg/>"));
        await Promise.resolve();
        await Promise.resolve();

        expect(notifier.logError).toHaveBeenCalledWith(failure);
        expect(notifier.logInfo).not.toHaveBeenCalled();
    });

    it("does not write a file when the svg payload is empty", () => {
        const { controller, captured } = createController();
        controller.writeToFile();

        captured.onMessage?.(svgReply(""));

        expect(fsWriteFileMock).not.toHaveBeenCalled();
    });
});

describe("CommandController command error surfacing", () => {
    it("logs and rethrows when changeLanguage's config update rejects", async () => {
        const { controller, notifier } = createController();
        showQuickPickMock.mockResolvedValue({ label: "English", description: "en" });
        const failure = new Error("update denied");
        configUpdateMock.mockRejectedValueOnce(failure);

        await expect(controller.changeLanguage()).rejects.toThrow(failure);
        expect(notifier.logError).toHaveBeenCalledWith(failure);
    });

    it("logs and rethrows when changeEngineVersion rejects", async () => {
        const { controller, bpmnService, notifier } = createController();
        const failure = new Error("engine change failed");
        bpmnService.changeEngineVersion.mockRejectedValueOnce(failure);

        await expect(controller.changeEngineVersion()).rejects.toThrow(failure);
        expect(notifier.logError).toHaveBeenCalledWith(failure);
    });
});

describe("CommandController.newBpmnModel", () => {
    it("writes and opens nothing when the save dialog is dismissed", async () => {
        const { controller, picker } = createController();
        showSaveDialogMock.mockResolvedValue(undefined);

        await controller.newBpmnModel();

        expect(picker.pickExecutionPlatform).not.toHaveBeenCalled();
        expect(fsWriteFileMock).not.toHaveBeenCalled();
        expect(executeCommandMock).not.toHaveBeenCalled();
    });

    it("scaffolds a c7 model at the chosen target and opens it in the bpmn editor", async () => {
        const { controller, picker } = createController();
        const target = fakeUri("/work/new-diagram.bpmn");
        showSaveDialogMock.mockResolvedValue(target);
        picker.pickExecutionPlatform.mockResolvedValue("c7");

        await controller.newBpmnModel();

        const [uriArg, bufferArg] = fsWriteFileMock.mock.calls[0];
        expect(uriArg).toBe(target);
        const xml = (bufferArg as Buffer).toString();
        // Namespace + latest-version marker prove the c7 template was seeded.
        expect(xml).toContain("xmlns:camunda");
        expect(xml).toContain(`modeler:executionPlatformVersion="${getLatestVersion("c7")}"`);
        expect(executeCommandMock).toHaveBeenCalledWith(
            "vscode.openWith",
            target,
            "bpmn-modeler.bpmn",
        );
    });

    it("creates nothing and does not rethrow when the engine pick is cancelled", async () => {
        const { controller, picker } = createController();
        showSaveDialogMock.mockResolvedValue(fakeUri("/work/new-diagram.bpmn"));
        picker.pickExecutionPlatform.mockRejectedValue(new UserCancelledError());

        await expect(controller.newBpmnModel()).resolves.toBeUndefined();
        expect(fsWriteFileMock).not.toHaveBeenCalled();
        expect(executeCommandMock).not.toHaveBeenCalled();
    });
});

describe("CommandController.newDmnModel", () => {
    it("scaffolds a dmn model at the chosen target and opens it in the dmn editor", async () => {
        const { controller } = createController();
        const target = fakeUri("/work/new-diagram.dmn");
        showSaveDialogMock.mockResolvedValue(target);

        await controller.newDmnModel();

        const xml = (fsWriteFileMock.mock.calls[0][1] as Buffer).toString();
        expect(xml).toContain("DMN/20191111/MODEL");
        expect(executeCommandMock).toHaveBeenCalledWith(
            "vscode.openWith",
            target,
            "bpmn-modeler.dmn",
        );
    });

    it("appends the extension when the dialog returns a path without one", async () => {
        const { controller } = createController();
        showSaveDialogMock.mockResolvedValue(fakeUri("/work/new-diagram"));

        await controller.newDmnModel();

        const [uriArg] = fsWriteFileMock.mock.calls[0];
        expect((uriArg as { path: string }).path).toBe("/work/new-diagram.dmn");
    });
});
