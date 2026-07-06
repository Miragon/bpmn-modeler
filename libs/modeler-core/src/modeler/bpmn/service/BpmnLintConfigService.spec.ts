import { beforeEach, describe, expect, it, vi } from "vitest";

// `BpmnLintConfigService` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import { BpmnlintConfigQuery } from "@miragon/bpmn-modeler-shared";

import { BpmnLintConfigService } from "./BpmnLintConfigService";

const EDITOR = "file:///work/diagram.bpmn";

function createService() {
    const editorStore = { postMessage: vi.fn().mockResolvedValue(true) };
    const vsDocument = { getFilePath: vi.fn().mockReturnValue(EDITOR) };
    const locator = {
        findNearestConfig: vi.fn().mockResolvedValue(undefined),
        readConfig: vi.fn(),
    };
    const statusBar = {
        showBpmnlintActive: vi.fn(),
        showBpmnlintNoConfig: vi.fn(),
        hideBpmnlintStatus: vi.fn(),
    };
    const notifier = {
        logError: vi.fn(),
        logInfo: vi.fn(),
        logDebug: vi.fn(),
        logWarning: vi.fn(),
    };

    const service = new BpmnLintConfigService(
        editorStore as never,
        vsDocument as never,
        locator as never,
        statusBar as never,
        notifier as never,
    );

    return { service, editorStore, vsDocument, locator, statusBar, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnLintConfigService.setBpmnlintConfig", () => {
    it("posts the parsed config and shows the active status when a config is found", async () => {
        const { service, editorStore, locator, statusBar, notifier } = createService();
        locator.findNearestConfig.mockResolvedValue("/work/.bpmnlintrc");
        locator.readConfig.mockResolvedValue(JSON.stringify({ extends: "bpmnlint:recommended" }));

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        // Discovery walks from the document's directory, not the file itself.
        expect(locator.findNearestConfig).toHaveBeenCalledWith("file:///work");
        expect(statusBar.showBpmnlintActive).toHaveBeenCalledWith("/work/.bpmnlintrc");
        expect(statusBar.showBpmnlintNoConfig).not.toHaveBeenCalled();
        // Reproduction breadcrumb names the applied config path.
        expect(notifier.logInfo).toHaveBeenCalledWith(
            "bpmnlint config applied from /work/.bpmnlintrc",
        );
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintConfigQuery;
        expect(msg.type).toBe("BpmnlintConfigQuery");
        expect(msg.config).toEqual({ extends: "bpmnlint:recommended" });
    });

    it("posts null and shows the no-config status (debug-only) when nothing is found", async () => {
        const { service, editorStore, locator, statusBar, notifier } = createService();
        locator.findNearestConfig.mockResolvedValue(undefined);

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        expect(locator.readConfig).not.toHaveBeenCalled();
        expect(statusBar.showBpmnlintNoConfig).toHaveBeenCalledOnce();
        // The no-config case fires on every editor open → debug, not info.
        expect(notifier.logDebug).toHaveBeenCalledWith("No .bpmnlintrc found; linting inactive");
        expect(notifier.logInfo).not.toHaveBeenCalled();
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintConfigQuery;
        expect(msg.config).toBeNull();
    });

    it("still pushes the config but leaves the status bar untouched when reflectInStatusBar is false", async () => {
        const { service, editorStore, locator, statusBar } = createService();
        locator.findNearestConfig.mockResolvedValue("/work/.bpmnlintrc");
        locator.readConfig.mockResolvedValue(JSON.stringify({ extends: "bpmnlint:recommended" }));

        const result = await service.setBpmnlintConfig(EDITOR, false);

        expect(result).toBe(true);
        expect(statusBar.showBpmnlintActive).not.toHaveBeenCalled();
        expect(statusBar.showBpmnlintNoConfig).not.toHaveBeenCalled();
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintConfigQuery;
        expect(msg.config).toEqual({ extends: "bpmnlint:recommended" });
    });

    it("logs and falls back to null without throwing on malformed JSON", async () => {
        const { service, editorStore, locator, statusBar, notifier } = createService();
        locator.findNearestConfig.mockResolvedValue("/work/.bpmnlintrc");
        locator.readConfig.mockResolvedValue("{ not json");

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        expect(notifier.logError).toHaveBeenCalledOnce();
        expect(statusBar.showBpmnlintNoConfig).toHaveBeenCalledOnce();
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintConfigQuery;
        expect(msg.config).toBeNull();
    });

    it("swallows a hidden-panel post rejection as a warning without misreporting it as a read failure", async () => {
        const { service, editorStore, locator, notifier } = createService();
        locator.findNearestConfig.mockResolvedValue("/work/.bpmnlintrc");
        locator.readConfig.mockResolvedValue(JSON.stringify({ extends: "bpmnlint:recommended" }));
        // The watcher fires while the diagram panel is hidden, so the post rejects.
        editorStore.postMessage.mockRejectedValue(new Error("The active editor is hidden."));

        const result = await service.setBpmnlintConfig(EDITOR);

        // Recoverable transport drop: resolves false, never throws.
        expect(result).toBe(false);
        expect(notifier.logWarning).toHaveBeenCalledWith(
            "[bpmnlint] config push skipped: The active editor is hidden.",
        );
        // The read succeeded — the transport failure must not be logged as one.
        expect(notifier.logError).not.toHaveBeenCalled();
        // The sole post means no second rejecting fallback push.
        expect(editorStore.postMessage).toHaveBeenCalledOnce();
    });
});
