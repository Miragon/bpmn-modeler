import { beforeEach, describe, expect, it, vi } from "vitest";

// `BpmnLintConfigService` imports `EditorSessionStore`, which imports the
// `Disposable` *type* from vscode — erased at runtime, but the specifier must
// still resolve under vitest.
vi.mock("vscode", () => ({}));

import {
    BpmnLintDisabledQuery,
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
} from "@miragon/bpmn-modeler-shared";

import { BpmnLintConfigService } from "./BpmnLintConfigService";

const EDITOR = "file:///work/diagram.bpmn";
// No platform markers → detectPlatform() throws → structural-only default.
const XML = "<xml/>";
const XML_C7 = '<definitions modeler:executionPlatformVersion="7.20.0" />';
const XML_C8 = '<definitions modeler:executionPlatformVersion="8.6.0" />';
const RESULTS = {
    "label-required": [{ id: "Task_1", message: "Element requires a label", category: "warn" }],
};

function createService() {
    const editorStore = {
        postMessage: vi.fn().mockResolvedValue(true),
        getActiveEditorId: vi.fn().mockReturnValue(EDITOR),
    };
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
        showBpmnlintDefault: vi.fn(),
        showBpmnlintDisabled: vi.fn(),
        showBpmnlintNoConfig: vi.fn(),
        hideBpmnlintStatus: vi.fn(),
    };
    const notifier = {
        logError: vi.fn(),
        logInfo: vi.fn(),
        logDebug: vi.fn(),
        logWarning: vi.fn(),
    };
    const settings = {
        getLintingEnabled: vi.fn().mockReturnValue(true),
    };

    const service = new BpmnLintConfigService(
        editorStore as never,
        vsDocument as never,
        locator as never,
        lintRunner as never,
        diagnostics as never,
        statusBar as never,
        notifier as never,
        settings as never,
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
        settings,
    };
}

/** True when no `BpmnlintResultsQuery` was ever posted (the in-page path must not push one). */
function noResultsQueryPosted(editorStore: {
    postMessage: { mock: { calls: unknown[][] } };
}): boolean {
    return editorStore.postMessage.mock.calls.every(
        (call) => (call[1] as { type: string }).type !== "BpmnlintResultsQuery",
    );
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnLintConfigService.setBpmnlintConfig — workspace config (external)", () => {
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
        expect(service.getLintMode(EDITOR)).toBe("external");
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
        expect(service.getLintMode(EDITOR)).toBe("external");
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

describe("BpmnLintConfigService.setBpmnlintConfig — no config (in-page handback)", () => {
    it("instructs the webview to run in-page, does not lint host-side, and posts no results query", async () => {
        const { service, editorStore, locator, lintRunner, diagnostics, statusBar } =
            createService();
        locator.findNearestConfig.mockResolvedValue(undefined);

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(service.getLintMode(EDITOR)).toBe("in-page");
        // Provisional: clear stale diagnostics + a default status while the
        // webview's first run is in flight (no cached event yet).
        expect(diagnostics.clear).toHaveBeenCalledWith(EDITOR);
        expect(statusBar.showBpmnlintDefault).toHaveBeenCalledWith(undefined);
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintInPageQuery;
        expect(msg.type).toBe("BpmnlintInPageQuery");
        expect(noResultsQueryPosted(editorStore)).toBe(true);
    });

    it("reflects the detected platform in the provisional status (C7)", async () => {
        const { service, locator, statusBar, vsDocument } = createService();
        locator.findNearestConfig.mockResolvedValue(undefined);
        vsDocument.getContent.mockReturnValue(XML_C7);

        await service.setBpmnlintConfig(EDITOR);

        expect(statusBar.showBpmnlintDefault).toHaveBeenCalledWith("c7");
    });

    it("reflects the detected platform in the provisional status (C8)", async () => {
        const { service, locator, statusBar, vsDocument } = createService();
        locator.findNearestConfig.mockResolvedValue(undefined);
        vsDocument.getContent.mockReturnValue(XML_C8);

        await service.setBpmnlintConfig(EDITOR);

        expect(statusBar.showBpmnlintDefault).toHaveBeenCalledWith("c8");
    });

    it("leaves the status bar untouched when reflectInStatusBar is false", async () => {
        const { service, editorStore, locator, statusBar } = createService();
        locator.findNearestConfig.mockResolvedValue(undefined);

        await service.setBpmnlintConfig(EDITOR, false);

        expect(statusBar.showBpmnlintDefault).not.toHaveBeenCalled();
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnlintInPageQuery;
        expect(msg.type).toBe("BpmnlintInPageQuery");
    });

    it("replays the last cached in-page event on re-instruct (panel re-activation)", async () => {
        const { service, locator, diagnostics, statusBar, vsDocument } = createService();
        locator.findNearestConfig.mockResolvedValue(undefined);

        await service.setBpmnlintConfig(EDITOR); // in-page, no cache yet
        service.applyWebviewLintResults(EDITOR, RESULTS, []); // caches the event
        vi.clearAllMocks();
        vsDocument.getContent.mockReturnValue(XML);
        locator.findNearestConfig.mockResolvedValue(undefined);

        await service.setBpmnlintConfig(EDITOR); // re-instruct

        // Cached findings are restored instead of a blank provisional state.
        expect(diagnostics.publish).toHaveBeenCalledWith(EDITOR, XML, RESULTS);
        expect(statusBar.showBpmnlintDefault).toHaveBeenCalledWith(undefined);
    });
});

describe("BpmnLintConfigService.applyWebviewLintResults", () => {
    async function inPageService() {
        const ctx = createService();
        ctx.locator.findNearestConfig.mockResolvedValue(undefined);
        await ctx.service.setBpmnlintConfig(EDITOR); // flip to in-page
        vi.clearAllMocks();
        ctx.editorStore.getActiveEditorId.mockReturnValue(EDITOR);
        ctx.settings.getLintingEnabled.mockReturnValue(true);
        ctx.vsDocument.getContent.mockReturnValue(XML);
        return ctx;
    }

    it("publishes diagnostics, shows the default status, warns on unresolved, and caches", async () => {
        const { service, diagnostics, statusBar, notifier } = await inPageService();

        service.applyWebviewLintResults(EDITOR, RESULTS, ["some-plugin/some-rule"]);

        expect(diagnostics.publish).toHaveBeenCalledWith(EDITOR, XML, RESULTS);
        expect(statusBar.showBpmnlintDefault).toHaveBeenCalledWith(undefined);
        expect(notifier.logWarning).toHaveBeenCalledWith(
            expect.stringContaining("some-plugin/some-rule"),
        );
    });

    it("publishes diagnostics but skips the status bar when the editor is not active", async () => {
        const { service, editorStore, diagnostics, statusBar } = await inPageService();
        editorStore.getActiveEditorId.mockReturnValue("file:///other.bpmn");

        service.applyWebviewLintResults(EDITOR, RESULTS, []);

        // The Problems panel is global, so diagnostics always publish...
        expect(diagnostics.publish).toHaveBeenCalledWith(EDITOR, XML, RESULTS);
        // ...but a background editor's push must not steal the visible status.
        expect(statusBar.showBpmnlintDefault).not.toHaveBeenCalled();
    });

    it("ignores a push when the editor is on the external path (default)", () => {
        const { service, diagnostics } = createService();

        service.applyWebviewLintResults(EDITOR, RESULTS, []);

        expect(diagnostics.publish).not.toHaveBeenCalled();
    });

    it("ignores a push when linting is disabled", async () => {
        const { service, diagnostics, settings } = await inPageService();
        settings.getLintingEnabled.mockReturnValue(false);

        service.applyWebviewLintResults(EDITOR, RESULTS, []);

        expect(diagnostics.publish).not.toHaveBeenCalled();
    });

    it("ignores a stale in-page push after a workspace-config takeover", async () => {
        const { service, locator, diagnostics } = createService();
        locator.findNearestConfig.mockResolvedValue(undefined);
        await service.setBpmnlintConfig(EDITOR); // in-page

        // Config appears — the mode flips to external before the takeover push.
        locator.findNearestConfig.mockResolvedValue("/work/.bpmnlintrc");
        locator.readConfig.mockResolvedValue(JSON.stringify({ extends: "bpmnlint:recommended" }));
        await service.setBpmnlintConfig(EDITOR);
        expect(service.getLintMode(EDITOR)).toBe("external");
        diagnostics.publish.mockClear();

        // A webview push already in flight arrives late — it must be dropped.
        service.applyWebviewLintResults(EDITOR, RESULTS, []);
        expect(diagnostics.publish).not.toHaveBeenCalled();
    });
});

describe("BpmnLintConfigService.setBpmnlintConfig — disabled", () => {
    it("skips linting and pushes the disabled state when linting is turned off", async () => {
        const { service, editorStore, locator, lintRunner, diagnostics, statusBar, settings } =
            createService();
        settings.getLintingEnabled.mockReturnValue(false);

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        // The gate short-circuits before any config discovery or lint run.
        expect(locator.findNearestConfig).not.toHaveBeenCalled();
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(diagnostics.clear).toHaveBeenCalledWith(EDITOR);
        expect(statusBar.showBpmnlintDisabled).toHaveBeenCalledOnce();
        expect(service.getLintMode(EDITOR)).toBe("external");
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnLintDisabledQuery;
        expect(msg.type).toBe("BpmnLintDisabledQuery");
    });

    it("leaves the status bar untouched when disabled and reflectInStatusBar is false", async () => {
        const { service, editorStore, statusBar, settings } = createService();
        settings.getLintingEnabled.mockReturnValue(false);

        await service.setBpmnlintConfig(EDITOR, false);

        expect(statusBar.showBpmnlintDisabled).not.toHaveBeenCalled();
        const msg = editorStore.postMessage.mock.calls[0][1] as BpmnLintDisabledQuery;
        expect(msg.type).toBe("BpmnLintDisabledQuery");
    });

    it("clears the cached in-page event so a re-instruct does not replay stale findings", async () => {
        const { service, locator, diagnostics, statusBar, settings } = createService();
        locator.findNearestConfig.mockResolvedValue(undefined);
        await service.setBpmnlintConfig(EDITOR); // in-page
        service.applyWebviewLintResults(EDITOR, RESULTS, []); // cache an event

        // User disables linting — the cache is dropped (external mode).
        settings.getLintingEnabled.mockReturnValue(false);
        await service.setBpmnlintConfig(EDITOR);

        // Re-enable + no config → in-page again, but with no cached event to
        // replay: back to the provisional (blank) state.
        settings.getLintingEnabled.mockReturnValue(true);
        vi.clearAllMocks();
        locator.findNearestConfig.mockResolvedValue(undefined);
        await service.setBpmnlintConfig(EDITOR);

        expect(diagnostics.publish).not.toHaveBeenCalled();
        expect(diagnostics.clear).toHaveBeenCalledWith(EDITOR);
        expect(statusBar.showBpmnlintDefault).toHaveBeenCalledWith(undefined);
    });
});
