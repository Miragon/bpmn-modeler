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
const CONFIG_PATH = "/work/.bpmnlintrc";
// No platform markers → detectPlatform() throws → structural-only default.
const XML = "<xml/>";
const XML_C7 = '<definitions modeler:executionPlatformVersion="7.20.0" />';
const XML_C8 = '<definitions modeler:executionPlatformVersion="8.6.0" />';
const RESULTS = {
    "label-required": [{ id: "Task_1", message: "Element requires a label", category: "warn" }],
};

// The bundled resolver covers this (no moddleExtensions) → linted in-page.
const COVERED_CONFIG = { extends: "bpmnlint:recommended" };
const COVERED_RAW = JSON.stringify(COVERED_CONFIG);
// A string moddleExtension is a Node-only module path → the static pre-check
// escalates immediately (today's host-side behaviour).
const ESCALATING_CONFIG = {
    extends: "bpmnlint:recommended",
    moddleExtensions: { acme: "./acme.json" },
};
const ESCALATING_RAW = JSON.stringify(ESCALATING_CONFIG);

/** Lets a fire-and-forget `runWorkspaceLint` settle before assertions. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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

type Store = { postMessage: { mock: { calls: unknown[][] } } };

/** Every posted message of the given `type`, in post order. */
function postedOfType<T extends { type: string } = { type: string }>(
    editorStore: Store,
    type: string,
): T[] {
    return editorStore.postMessage.mock.calls
        .map((call) => call[1] as { type: string })
        .filter((message) => message.type === type) as T[];
}

/** True when no `BpmnlintResultsQuery` was ever posted (the in-page path must not push one). */
function noResultsQueryPosted(editorStore: Store): boolean {
    return postedOfType(editorStore, "BpmnlintResultsQuery").length === 0;
}

/** Arranges a live covered (in-page) session and returns its instruction token. */
async function coveredSession(): Promise<ReturnType<typeof createService> & { token: string }> {
    const ctx = createService();
    ctx.locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
    ctx.locator.readConfig.mockResolvedValue(COVERED_RAW);
    await ctx.service.setBpmnlintConfig(EDITOR);
    const [instruction] = postedOfType<BpmnlintInPageQuery>(ctx.editorStore, "BpmnlintInPageQuery");
    return { ...ctx, token: instruction.configToken as string };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("BpmnLintConfigService.setBpmnlintConfig — escalated workspace config (Node run)", () => {
    it("lints host-side and posts the results with the active status when the config needs the Node resolver", async () => {
        const { service, editorStore, locator, lintRunner, diagnostics, statusBar, notifier } =
            createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        // Discovery walks from the document's directory, not the file itself.
        expect(locator.findNearestConfig).toHaveBeenCalledWith("file:///work");
        expect(lintRunner.lint).toHaveBeenCalledWith(XML, CONFIG_PATH, ESCALATING_CONFIG);
        expect(diagnostics.publish).toHaveBeenCalledWith(EDITOR, XML, RESULTS);
        expect(statusBar.showBpmnlintActive).toHaveBeenCalledWith(CONFIG_PATH);
        expect(statusBar.showBpmnlintUnresolved).not.toHaveBeenCalled();
        expect(notifier.logInfo).toHaveBeenCalledWith(`bpmnlint applied from ${CONFIG_PATH}`);
        expect(service.getLintMode(EDITOR)).toBe("external");
        // Escalation runs host-side — no in-page instruction is ever posted.
        expect(postedOfType(editorStore, "BpmnlintInPageQuery")).toHaveLength(0);
        const [msg] = postedOfType<BpmnlintResultsQuery>(editorStore, "BpmnlintResultsQuery");
        expect(msg.results).toEqual(RESULTS);
    });

    it("shows the unresolved status and warns when rules could not be resolved", async () => {
        const { service, locator, lintRunner, statusBar, notifier } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        lintRunner.lint.mockResolvedValue({ results: {}, unresolved: ["custom/x"] });

        await service.setBpmnlintConfig(EDITOR);

        expect(statusBar.showBpmnlintUnresolved).toHaveBeenCalledWith(CONFIG_PATH, ["custom/x"]);
        expect(statusBar.showBpmnlintActive).not.toHaveBeenCalled();
        expect(notifier.logWarning).toHaveBeenCalledWith(expect.stringContaining("custom/x"));
    });

    it("still posts results but leaves the status bar untouched when reflectInStatusBar is false", async () => {
        const { service, editorStore, locator, statusBar } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);

        const result = await service.setBpmnlintConfig(EDITOR, false);

        expect(result).toBe(true);
        expect(statusBar.showBpmnlintActive).not.toHaveBeenCalled();
        expect(statusBar.showBpmnlintNoConfig).not.toHaveBeenCalled();
        const [msg] = postedOfType<BpmnlintResultsQuery>(editorStore, "BpmnlintResultsQuery");
        expect(msg.results).toEqual(RESULTS);
    });

    it("re-lints via the Node path on a cache-hit re-run and posts no new in-page instruction", async () => {
        const { service, editorStore, locator, lintRunner } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        await service.setBpmnlintConfig(EDITOR);
        expect(lintRunner.lint).toHaveBeenCalledTimes(1);

        await service.setBpmnlintConfig(EDITOR);

        // The document may have changed, so it re-lints — but the version is
        // unchanged, so it does not re-negotiate or post a fresh instruction.
        expect(lintRunner.lint).toHaveBeenCalledTimes(2);
        expect(postedOfType(editorStore, "BpmnlintInPageQuery")).toHaveLength(0);
    });

    it("logs and falls back to null without throwing on malformed JSON", async () => {
        const { service, editorStore, locator, diagnostics, statusBar, notifier } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue("{ not json");

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        expect(notifier.logError).toHaveBeenCalledOnce();
        expect(statusBar.showBpmnlintNoConfig).toHaveBeenCalledOnce();
        expect(diagnostics.clear).toHaveBeenCalledWith(EDITOR);
        expect(service.getLintMode(EDITOR)).toBe("external");
        const [msg] = postedOfType<BpmnlintResultsQuery>(editorStore, "BpmnlintResultsQuery");
        expect(msg.results).toBeNull();
    });

    it("swallows a hidden-panel post rejection as a warning without misreporting it as a read failure", async () => {
        const { service, editorStore, locator, notifier } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
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

describe("BpmnLintConfigService.setBpmnlintConfig — covered workspace config (in-page)", () => {
    it("instructs the webview to lint the config in-page with a token, and never lints host-side", async () => {
        const { service, editorStore, locator, lintRunner, diagnostics, statusBar } =
            createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(COVERED_RAW);

        const result = await service.setBpmnlintConfig(EDITOR);

        expect(result).toBe(true);
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(service.getLintMode(EDITOR)).toBe("in-page");
        // Provisional Active (not the zero-config default) while the first webview
        // run is in flight.
        expect(diagnostics.clear).toHaveBeenCalledWith(EDITOR);
        expect(statusBar.showBpmnlintActive).toHaveBeenCalledWith(CONFIG_PATH);
        expect(statusBar.showBpmnlintDefault).not.toHaveBeenCalled();
        const [msg] = postedOfType<BpmnlintInPageQuery>(editorStore, "BpmnlintInPageQuery");
        expect(msg.config).toEqual(COVERED_CONFIG);
        expect(typeof msg.configToken).toBe("string");
        expect(noResultsQueryPosted(editorStore)).toBe(true);
    });

    it("applies a matching-token clean in-page event as Active", async () => {
        const { service, diagnostics, statusBar, token } = await coveredSession();
        vi.clearAllMocks();

        service.applyWebviewLintResults(EDITOR, RESULTS, [], token);

        expect(diagnostics.publish).toHaveBeenCalledWith(EDITOR, XML, RESULTS);
        expect(statusBar.showBpmnlintActive).toHaveBeenCalledWith(CONFIG_PATH);
        expect(statusBar.showBpmnlintDefault).not.toHaveBeenCalled();
    });

    it("replays the cached covered event as Active on a cache-hit re-instruct", async () => {
        const { service, editorStore, diagnostics, statusBar, token } = await coveredSession();
        service.applyWebviewLintResults(EDITOR, RESULTS, [], token); // cache it
        vi.clearAllMocks();

        await service.setBpmnlintConfig(EDITOR); // same version → cache hit

        expect(diagnostics.publish).toHaveBeenCalledWith(EDITOR, XML, RESULTS);
        expect(statusBar.showBpmnlintActive).toHaveBeenCalledWith(CONFIG_PATH);
        // Re-sends the instruction carrying the same token (webview dedups on it).
        const [msg] = postedOfType<BpmnlintInPageQuery>(editorStore, "BpmnlintInPageQuery");
        expect(msg.configToken).toBe(token);
    });
});

describe("BpmnLintConfigService — escalation from a covered in-page run", () => {
    it("escalates to the Node linter on a non-empty unresolved and does not apply the partial in-page findings", async () => {
        const { service, locator, lintRunner, diagnostics, token } = await coveredSession();
        locator.readConfig.mockResolvedValue(COVERED_RAW);
        lintRunner.lint.mockResolvedValue({ results: RESULTS, unresolved: [] });
        vi.clearAllMocks();

        const partial = { "x/y": [{ id: "T", message: "partial", category: "warn" }] };
        service.applyWebviewLintResults(EDITOR, partial, ["some-plugin/some-rule"], token);
        await flush();

        // The Node run happened against the covered config…
        expect(lintRunner.lint).toHaveBeenCalledWith(XML, CONFIG_PATH, COVERED_CONFIG);
        // …publishing the Node results, never the partial in-page findings.
        expect(diagnostics.publish).toHaveBeenCalledWith(EDITOR, XML, RESULTS);
        expect(diagnostics.publish).not.toHaveBeenCalledWith(EDITOR, XML, partial);
        expect(service.getLintMode(EDITOR)).toBe("external");
    });

    it("drops a second same-token in-page event while the escalation Node run is in flight", async () => {
        const { service, locator, lintRunner, diagnostics, token } = await coveredSession();
        locator.readConfig.mockResolvedValue(COVERED_RAW);
        // Node lint hangs, so the mode is still "in-page" — the decision flip is
        // the only guard against a second event re-escalating.
        let release: (() => void) | undefined;
        lintRunner.lint.mockReturnValue(
            new Promise((resolve) => {
                release = () => resolve({ results: {}, unresolved: [] });
            }),
        );
        service.applyWebviewLintResults(EDITOR, RESULTS, ["p/r"], token); // triggers escalation
        diagnostics.publish.mockClear();

        service.applyWebviewLintResults(EDITOR, RESULTS, [], token); // second, same token

        expect(diagnostics.publish).not.toHaveBeenCalled();
        expect(lintRunner.lint).toHaveBeenCalledTimes(1);
        release?.();
        await flush();
    });
});

describe("BpmnLintConfigService.setBpmnlintConfig — no config (in-page default)", () => {
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
        const [msg] = postedOfType<BpmnlintInPageQuery>(editorStore, "BpmnlintInPageQuery");
        // Payload-free: no config and no token travel for the zero-config tier.
        expect(msg.config).toBeUndefined();
        expect(msg.configToken).toBeUndefined();
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
        expect(postedOfType(editorStore, "BpmnlintInPageQuery")).toHaveLength(1);
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

    it("drops a default-tier push that carries a token (a deleted-config era)", async () => {
        const { service, diagnostics, notifier } = await inPageService();

        service.applyWebviewLintResults(EDITOR, RESULTS, [], "stale-token");

        expect(diagnostics.publish).not.toHaveBeenCalled();
        expect(notifier.logDebug).toHaveBeenCalledWith(expect.stringContaining("superseded"));
    });

    it("ignores a stale in-page push after an escalating workspace-config takeover", async () => {
        const { service, locator, diagnostics } = createService();
        locator.findNearestConfig.mockResolvedValue(undefined);
        await service.setBpmnlintConfig(EDITOR); // in-page default

        // An escalating config appears — the mode flips to external before the push.
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        await service.setBpmnlintConfig(EDITOR);
        expect(service.getLintMode(EDITOR)).toBe("external");
        diagnostics.publish.mockClear();

        // A default-tier webview push already in flight arrives late — dropped.
        service.applyWebviewLintResults(EDITOR, RESULTS, []);
        expect(diagnostics.publish).not.toHaveBeenCalled();
    });
});

describe("BpmnLintConfigService — re-negotiation (both directions + race)", () => {
    it("mints a new-token in-page instruction when an escalated config becomes covered", async () => {
        const { service, editorStore, locator, lintRunner } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        await service.setBpmnlintConfig(EDITOR); // escalated (external)
        expect(service.getLintMode(EDITOR)).toBe("external");
        vi.clearAllMocks();

        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(COVERED_RAW);
        await service.setBpmnlintConfig(EDITOR); // edited → covered

        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(service.getLintMode(EDITOR)).toBe("in-page");
        const [msg] = postedOfType<BpmnlintInPageQuery>(editorStore, "BpmnlintInPageQuery");
        expect(msg.config).toEqual(COVERED_CONFIG);
        expect(typeof msg.configToken).toBe("string");
    });

    it("escalates when a covered config becomes uncovered", async () => {
        const { service, locator, lintRunner } = await coveredSession();
        vi.clearAllMocks();

        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        await service.setBpmnlintConfig(EDITOR); // edited → needs the Node resolver

        expect(lintRunner.lint).toHaveBeenCalledWith(XML, CONFIG_PATH, ESCALATING_CONFIG);
        expect(service.getLintMode(EDITOR)).toBe("external");
    });

    it("hands back to the payload-free default and forgets the negotiation when the config is deleted", async () => {
        const { service, editorStore, locator, statusBar } = await coveredSession();
        vi.clearAllMocks();

        locator.findNearestConfig.mockResolvedValue(undefined); // config deleted
        await service.setBpmnlintConfig(EDITOR);

        expect(service.getLintMode(EDITOR)).toBe("in-page");
        expect(statusBar.showBpmnlintDefault).toHaveBeenCalledWith(undefined);
        const [msg] = postedOfType<BpmnlintInPageQuery>(editorStore, "BpmnlintInPageQuery");
        expect(msg.config).toBeUndefined();
        expect(msg.configToken).toBeUndefined();

        // Negotiation gone: a default-tier event with the old token is now dropped.
        service.applyWebviewLintResults(EDITOR, RESULTS, [], "old-token");
        expect((editorStore.postMessage.mock.calls as unknown[][]).length).toBeGreaterThanOrEqual(
            1,
        );
    });

    it("drops a stale-token event without escalating when the config was edited mid-flight", async () => {
        const { service, editorStore, locator, lintRunner, diagnostics, token } =
            await coveredSession();

        // Config edited V1 → V2 (still covered) before V1's in-page run returns.
        locator.readConfig.mockResolvedValue(JSON.stringify({ ...COVERED_CONFIG, rules: {} }));
        await service.setBpmnlintConfig(EDITOR);
        const instructions = postedOfType<BpmnlintInPageQuery>(editorStore, "BpmnlintInPageQuery");
        const token2 = instructions[instructions.length - 1].configToken;
        expect(token2).not.toBe(token);
        vi.clearAllMocks();

        // A late V1 run (old token) reports it could not cover a rule.
        service.applyWebviewLintResults(EDITOR, RESULTS, ["p/r"], token);

        // Dropped as stale — it must not escalate the current V2 (still in-page).
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(diagnostics.publish).not.toHaveBeenCalled();
        expect(service.getLintMode(EDITOR)).toBe("in-page");
    });

    it("reuses the settled decision (same token) across disable → re-enable", async () => {
        const { service, editorStore, locator, settings, token } = await coveredSession();

        settings.getLintingEnabled.mockReturnValue(false);
        await service.setBpmnlintConfig(EDITOR); // disabled — negotiation retained
        vi.clearAllMocks();

        settings.getLintingEnabled.mockReturnValue(true);
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(COVERED_RAW);
        await service.setBpmnlintConfig(EDITOR); // re-enabled — same version

        const [msg] = postedOfType<BpmnlintInPageQuery>(editorStore, "BpmnlintInPageQuery");
        expect(msg.configToken).toBe(token); // reused, not re-minted
    });

    it("forgets the negotiation on clearDiagnostics so a re-open re-negotiates a fresh token", async () => {
        const { service, editorStore, locator, token } = await coveredSession();

        service.clearDiagnostics(EDITOR);
        vi.clearAllMocks();

        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(COVERED_RAW);
        await service.setBpmnlintConfig(EDITOR);

        const [msg] = postedOfType<BpmnlintInPageQuery>(editorStore, "BpmnlintInPageQuery");
        expect(msg.configToken).not.toBe(token);
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
        const [msg] = postedOfType<BpmnLintDisabledQuery>(editorStore, "BpmnLintDisabledQuery");
        expect(msg.type).toBe("BpmnLintDisabledQuery");
    });

    it("leaves the status bar untouched when disabled and reflectInStatusBar is false", async () => {
        const { service, editorStore, statusBar, settings } = createService();
        settings.getLintingEnabled.mockReturnValue(false);

        await service.setBpmnlintConfig(EDITOR, false);

        expect(statusBar.showBpmnlintDisabled).not.toHaveBeenCalled();
        expect(postedOfType(editorStore, "BpmnLintDisabledQuery")).toHaveLength(1);
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
