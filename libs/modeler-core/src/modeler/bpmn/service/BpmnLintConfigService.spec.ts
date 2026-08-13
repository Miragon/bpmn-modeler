import { beforeEach, describe, expect, it, vi } from "vitest";

// `BpmnLintConfigService` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import { BpmnlintResultsQuery } from "@miragon/bpmn-modeler-shared";

import { BpmnLintConfigService } from "./BpmnLintConfigService";

const EDITOR = "file:///work/diagram.bpmn";
const XML = "<xml/>";
const RESULTS = {
    "label-required": [{ id: "Task_1", message: "Element requires a label", category: "warn" }],
};

function createService() {
    const editorStore = { postMessage: vi.fn().mockResolvedValue(true) };
    const vsDocument = {
        getFilePath: vi.fn().mockReturnValue(EDITOR),
        getContent: vi.fn().mockReturnValue(XML),
    };
    const locator = {
        findNearestConfig: vi.fn().mockResolvedValue(undefined),
        readConfig: vi.fn(),
    };
    const lintRunner = {
        lint: vi.fn().mockResolvedValue({ results: RESULTS, unresolved: [] }),
    };
    const diagnostics = { publish: vi.fn(), clear: vi.fn() };
    const statusBar = {
        showBpmnlintActive: vi.fn(),
        showBpmnlintUnresolved: vi.fn(),
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
        lintRunner as never,
        diagnostics as never,
        statusBar as never,
        notifier as never,
    );

    return {
        service,
        editorStore,
        vsDocument,
        locator,
        lintRunner,
        diagnostics,
        statusBar,
        notifier,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnLintConfigService.setBpmnlintConfig", () => {
    it("lints the document and posts the results with the active status when a config is found", async () => {
        const { service, editorStore, locator, lintRunner, diagnostics, statusBar, notifier } =
            createService();
        locator.findNearestConfig.mockResolvedValue("/work/.bpmnlintrc");
        locator.readConfig.mockResolvedValue(JSON.stringify({ extends: "bpmnlint:recommended" }));

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        // Discovery walks from the document's directory, not the file itself.
        expect(locator.findNearestConfig).toHaveBeenCalledWith("file:///work");
        expect(lintRunner.lint).toHaveBeenCalledWith(XML, "/work/.bpmnlintrc", {
            extends: "bpmnlint:recommended",
        });
        expect(diagnostics.publish).toHaveBeenCalledWith(EDITOR, XML, RESULTS);
        expect(statusBar.showBpmnlintActive).toHaveBeenCalledWith("/work/.bpmnlintrc");
        expect(statusBar.showBpmnlintUnresolved).not.toHaveBeenCalled();
        expect(notifier.logInfo).toHaveBeenCalledWith("bpmnlint applied from /work/.bpmnlintrc");
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintResultsQuery;
        expect(msg.type).toBe("BpmnlintResultsQuery");
        expect(msg.results).toEqual(RESULTS);
    });

    it("shows the unresolved status and warns when rules could not be resolved", async () => {
        const { service, locator, lintRunner, statusBar, notifier } = createService();
        locator.findNearestConfig.mockResolvedValue("/work/.bpmnlintrc");
        locator.readConfig.mockResolvedValue(JSON.stringify({ rules: { "custom/x": "error" } }));
        lintRunner.lint.mockResolvedValue({ results: {}, unresolved: ["custom/x"] });

        await service.setBpmnlintConfig(EDITOR);

        expect(statusBar.showBpmnlintUnresolved).toHaveBeenCalledWith("/work/.bpmnlintrc", [
            "custom/x",
        ]);
        expect(statusBar.showBpmnlintActive).not.toHaveBeenCalled();
        expect(notifier.logWarning).toHaveBeenCalledWith(expect.stringContaining("custom/x"));
    });

    it("posts null, clears diagnostics, and shows the no-config status when nothing is found", async () => {
        const { service, editorStore, locator, lintRunner, diagnostics, statusBar, notifier } =
            createService();
        locator.findNearestConfig.mockResolvedValue(undefined);

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(diagnostics.clear).toHaveBeenCalledWith(EDITOR);
        expect(statusBar.showBpmnlintNoConfig).toHaveBeenCalledOnce();
        expect(notifier.logDebug).toHaveBeenCalledWith("No .bpmnlintrc found; linting inactive");
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintResultsQuery;
        expect(msg.results).toBeNull();
    });

    it("still posts results but leaves the status bar untouched when reflectInStatusBar is false", async () => {
        const { service, editorStore, locator, statusBar } = createService();
        locator.findNearestConfig.mockResolvedValue("/work/.bpmnlintrc");
        locator.readConfig.mockResolvedValue(JSON.stringify({ extends: "bpmnlint:recommended" }));

        const result = await service.setBpmnlintConfig(EDITOR, false);

        expect(result).toBe(true);
        expect(statusBar.showBpmnlintActive).not.toHaveBeenCalled();
        expect(statusBar.showBpmnlintNoConfig).not.toHaveBeenCalled();
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintResultsQuery;
        expect(msg.results).toEqual(RESULTS);
    });

    it("logs and falls back to null without throwing on malformed JSON", async () => {
        const { service, editorStore, locator, diagnostics, statusBar, notifier } = createService();
        locator.findNearestConfig.mockResolvedValue("/work/.bpmnlintrc");
        locator.readConfig.mockResolvedValue("{ not json");

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        expect(notifier.logError).toHaveBeenCalledOnce();
        expect(statusBar.showBpmnlintNoConfig).toHaveBeenCalledOnce();
        expect(diagnostics.clear).toHaveBeenCalledWith(EDITOR);
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintResultsQuery;
        expect(msg.results).toBeNull();
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
            "[bpmnlint] results push skipped: The active editor is hidden.",
        );
        // The lint succeeded — the transport failure must not be logged as one.
        expect(notifier.logError).not.toHaveBeenCalled();
        expect(editorStore.postMessage).toHaveBeenCalledOnce();
    });
});
