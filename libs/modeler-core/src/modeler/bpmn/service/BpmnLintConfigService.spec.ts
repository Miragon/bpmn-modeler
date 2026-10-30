import { describe, expect, it, vi } from "vitest";

import {
    BpmnLintDisabledQuery,
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
} from "@miragon/bpmn-modeler-shared";

import { ArtifactService } from "../../../kernel/service/ArtifactService";
import { BpmnLintConfigLocator } from "./BpmnLintConfigLocator";
import { createTestHost, FakeEditorHandle, TestHost } from "../../../testing";
import { BpmnlintParticipant } from "../session/BpmnlintParticipant";
import { BpmnLintConfigService } from "./BpmnLintConfigService";

const PATH = "/work/diagram.bpmn";
const CONFIG_PATH = "/work/.bpmnlintrc";
// No platform markers → detectPlatform() throws → structural-only default.
const XML = "<xml/>";
const XML_C7 = '<definitions modeler:executionPlatformVersion="7.20.0" />';
const XML_C8 = '<definitions modeler:executionPlatformVersion="8.6.0" />';
const RESULTS = {
    "label-required": [{ id: "Task_1", message: "Element requires a label", category: "warn" }],
};
const STALE_RESULTS = {
    "stale-rule": [{ id: "Task_9", message: "Stale finding", category: "warn" }],
};

// The bundled resolver covers this (no moddleExtensions) → linted in-page.
const COVERED_CONFIG = { extends: "bpmnlint:recommended" };
const COVERED_RAW = JSON.stringify(COVERED_CONFIG);
// A string moddleExtension is a Node-only module path → linted on the host.
const ESCALATING_CONFIG = {
    extends: "bpmnlint:recommended",
    moddleExtensions: { acme: "./acme.json" },
};
const ESCALATING_RAW = JSON.stringify(ESCALATING_CONFIG);

type LintOutcome = { results: typeof RESULTS; unresolved: string[] };

/** Lets a fire-and-forget host lint settle before assertions. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function createService({ content = XML, config }: { content?: string; config?: string } = {}) {
    const host = createTestHost({
        folders: ["/work", "/other"],
        files: config === undefined ? {} : { [CONFIG_PATH]: config },
    });
    const editor = host.openEditor(PATH, content);
    editor.active = true;
    const locator = new BpmnLintConfigLocator(
        host.workspace,
        host.settings,
        new ArtifactService(host.workspace, host.settings),
    );
    const lintRunner = {
        lint: vi.fn().mockResolvedValue({ results: RESULTS, unresolved: [] }),
    };

    const service = new BpmnLintConfigService(
        host.store,
        host.documents,
        locator,
        lintRunner,
        host.diagnostics,
        host.statusBar,
        host.notifier,
        host.settings,
    );

    return { service, host, editor, lintRunner };
}

/** Forgets what the status bar and Problems panel show, so a later step's effect stands alone. */
function resetSurfaces(host: TestHost): void {
    host.statusBar.showBpmnlint({ state: "hidden" });
    host.diagnostics.published.clear();
}

function lastPosted<T extends BpmnlintInPageQuery | BpmnlintResultsQuery | BpmnLintDisabledQuery>(
    editor: FakeEditorHandle,
    type: T["type"],
): T | undefined {
    const posted = editor.postedOfType<T>(type);
    return posted[posted.length - 1];
}

/** Arranges a live covered (in-page) session and returns its instruction token. */
async function coveredSession(): Promise<ReturnType<typeof createService> & { token: string }> {
    const ctx = createService({ config: COVERED_RAW });
    await ctx.service.setBpmnlintConfig(ctx.editor.id);
    const instruction = lastPosted<BpmnlintInPageQuery>(ctx.editor, "BpmnlintInPageQuery");
    return { ...ctx, token: instruction?.configToken as string };
}

describe("BpmnLintConfigService.setBpmnlintConfig — escalated workspace config (host lint)", () => {
    it("lints host-side and posts the results with the active status when the config needs the Node resolver", async () => {
        const { service, host, editor, lintRunner } = createService({ config: ESCALATING_RAW });

        const result = await service.setBpmnlintConfig(editor.id);

        expect(result).toBe(true);
        expect(lintRunner.lint).toHaveBeenCalledWith(XML, CONFIG_PATH, ESCALATING_CONFIG);
        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        expect(host.statusBar.bpmnlint).toEqual({ state: "active", configPath: CONFIG_PATH });
        expect(host.notifier.logged("info")).toContain(`bpmnlint applied from ${CONFIG_PATH}`);
        expect(service.getLintMode(editor.id)).toBe("external");
        expect(editor.postedOfType("BpmnlintInPageQuery")).toHaveLength(0);
        const [msg] = editor.postedOfType<BpmnlintResultsQuery>("BpmnlintResultsQuery");
        expect(msg.results).toEqual(RESULTS);
    });

    it("shows the unresolved status and warns when rules could not be resolved", async () => {
        const { service, host, editor, lintRunner } = createService({ config: ESCALATING_RAW });
        lintRunner.lint.mockResolvedValue({ results: {}, unresolved: ["custom/x"] });

        await service.setBpmnlintConfig(editor.id);

        expect(host.statusBar.bpmnlint).toEqual({
            state: "unresolved",
            configPath: CONFIG_PATH,
            unresolved: ["custom/x"],
        });
        expect(host.notifier.logged("warning")).toEqual([expect.stringContaining("custom/x")]);
    });

    it("still posts results but leaves the status bar untouched when the editor is not focused", async () => {
        const { service, host, editor } = createService({ config: ESCALATING_RAW });
        editor.loseFocus();

        const result = await service.setBpmnlintConfig(editor.id);

        expect(result).toBe(true);
        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
        const [msg] = editor.postedOfType<BpmnlintResultsQuery>("BpmnlintResultsQuery");
        expect(msg.results).toEqual(RESULTS);
    });

    it("logs and falls back to null without throwing on malformed JSON", async () => {
        const { service, host, editor } = createService({ config: "{ not json" });
        host.diagnostics.publish(editor.id, XML, STALE_RESULTS);

        const result = await service.setBpmnlintConfig(editor.id);

        expect(result).toBe(true);
        expect(host.notifier.logged("error")).toEqual([
            expect.stringContaining("Failed to lint against .bpmnlintrc"),
        ]);
        expect(host.statusBar.bpmnlint).toEqual({ state: "noConfig" });
        expect(host.diagnostics.published.has(editor.id)).toBe(false);
        expect(service.getLintMode(editor.id)).toBe("external");
        const [msg] = editor.postedOfType<BpmnlintResultsQuery>("BpmnlintResultsQuery");
        expect(msg.results).toBeNull();
    });

    it("falls back to null when the host lint fails", async () => {
        const { service, host, editor, lintRunner } = createService({ config: ESCALATING_RAW });
        lintRunner.lint.mockRejectedValue(new Error("plugin crashed"));

        await service.setBpmnlintConfig(editor.id);

        expect(host.notifier.logged("error")).toEqual([expect.stringContaining("plugin crashed")]);
        expect(host.statusBar.bpmnlint).toEqual({ state: "noConfig" });
        const [msg] = editor.postedOfType<BpmnlintResultsQuery>("BpmnlintResultsQuery");
        expect(msg.results).toBeNull();
    });

    it("swallows a hidden-panel post rejection as a warning without misreporting it as a read failure", async () => {
        const { service, host, editor } = createService({ config: ESCALATING_RAW });
        // The watcher fires while the diagram panel is hidden, so the post rejects.
        editor.hidden = true;

        const result = await service.setBpmnlintConfig(editor.id);

        // Recoverable transport drop: resolves false, never throws.
        expect(result).toBe(false);
        expect(host.notifier.logged("warning")).toEqual([
            "[bpmnlint] results push skipped: The active editor is hidden.",
        ]);
        // The lint succeeded — the transport failure must not be logged as one.
        expect(host.notifier.logged("error")).toEqual([]);
    });
});

describe("BpmnLintConfigService.setBpmnlintConfig — covered workspace config (in-page)", () => {
    it("instructs the webview to lint the config in-page with a token, and never lints host-side", async () => {
        const { service, host, editor, lintRunner } = createService({ config: COVERED_RAW });
        host.diagnostics.publish(editor.id, XML, STALE_RESULTS);

        const result = await service.setBpmnlintConfig(editor.id);

        expect(result).toBe(true);
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(service.getLintMode(editor.id)).toBe("in-page");
        // Provisional Active (not the zero-config default) while the first webview
        // run is in flight.
        expect(host.diagnostics.published.has(editor.id)).toBe(false);
        expect(host.statusBar.bpmnlint).toEqual({ state: "active", configPath: CONFIG_PATH });
        const [msg] = editor.postedOfType<BpmnlintInPageQuery>("BpmnlintInPageQuery");
        expect(msg.config).toEqual(COVERED_CONFIG);
        expect(typeof msg.configToken).toBe("string");
        expect(editor.postedOfType("BpmnlintResultsQuery")).toHaveLength(0);
    });

    it("applies a matching-token clean in-page event as Active", async () => {
        const { service, host, editor, token } = await coveredSession();
        resetSurfaces(host);

        service.applyWebviewLintResults(editor.id, RESULTS, [], token);

        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        expect(host.statusBar.bpmnlint).toEqual({ state: "active", configPath: CONFIG_PATH });
    });

    it("replays the cached covered event as Active on a cache-hit re-instruct", async () => {
        const { service, host, editor, token } = await coveredSession();
        service.applyWebviewLintResults(editor.id, RESULTS, [], token); // cache it
        resetSurfaces(host);

        await service.setBpmnlintConfig(editor.id); // same version → cache hit

        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        expect(host.statusBar.bpmnlint).toEqual({ state: "active", configPath: CONFIG_PATH });
        // Re-sends the instruction carrying the same token (webview dedups on it).
        const msg = lastPosted<BpmnlintInPageQuery>(editor, "BpmnlintInPageQuery");
        expect(msg?.configToken).toBe(token);
    });

    it("escalates to the Node linter on a non-empty unresolved and does not apply the partial in-page findings", async () => {
        const { service, host, editor, lintRunner, token } = await coveredSession();

        const partial = { "x/y": [{ id: "T", message: "partial", category: "warn" }] };
        service.applyWebviewLintResults(editor.id, partial, ["some-plugin/some-rule"], token);
        expect(host.diagnostics.published.has(editor.id)).toBe(false);
        await flush();

        // The Node run happened against the covered config…
        expect(lintRunner.lint).toHaveBeenCalledWith(XML, CONFIG_PATH, COVERED_CONFIG);
        // …publishing the Node results, never the partial in-page findings.
        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        expect(service.getLintMode(editor.id)).toBe("external");
    });

    it("drops a second same-token in-page event while the escalation Node run is in flight", async () => {
        const { service, host, editor, lintRunner, token } = await coveredSession();
        // Node lint hangs, so the session is still escalating — only the stored
        // session guards against a second event re-escalating.
        let release: (() => void) | undefined;
        lintRunner.lint.mockReturnValue(
            new Promise((resolve) => {
                release = () => resolve({ results: {}, unresolved: [] });
            }),
        );
        service.applyWebviewLintResults(editor.id, RESULTS, ["p/r"], token); // triggers escalation

        service.applyWebviewLintResults(editor.id, RESULTS, [], token); // second, same token

        expect(host.diagnostics.published.has(editor.id)).toBe(false);
        expect(lintRunner.lint).toHaveBeenCalledTimes(1);
        expect(service.getLintMode(editor.id)).toBe("in-page");
        release?.();
        await flush();
    });
});

describe("BpmnLintConfigService.setBpmnlintConfig — no config (in-page default)", () => {
    it("instructs the webview to run in-page, does not lint host-side, and posts no results query", async () => {
        const { service, host, editor, lintRunner } = createService();
        host.diagnostics.publish(editor.id, XML, STALE_RESULTS);

        const result = await service.setBpmnlintConfig(editor.id);

        expect(result).toBe(true);
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(service.getLintMode(editor.id)).toBe("in-page");
        // Provisional: clear stale diagnostics + a default status while the
        // webview's first run is in flight (no cached event yet).
        expect(host.diagnostics.published.has(editor.id)).toBe(false);
        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: undefined });
        const [msg] = editor.postedOfType<BpmnlintInPageQuery>("BpmnlintInPageQuery");
        // Payload-free: no config and no token travel for the zero-config tier.
        expect(msg.config).toBeUndefined();
        expect(msg.configToken).toBeUndefined();
        expect(editor.postedOfType("BpmnlintResultsQuery")).toHaveLength(0);
    });

    it.each([
        { content: XML_C7, platform: "c7" },
        { content: XML_C8, platform: "c8" },
    ])("reflects the detected platform $platform in the provisional status", async (row) => {
        const { service, host, editor } = createService({ content: row.content });

        await service.setBpmnlintConfig(editor.id);

        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: row.platform });
    });

    it("leaves the status bar untouched when the editor is not focused", async () => {
        const { service, host, editor } = createService();
        editor.loseFocus();

        await service.setBpmnlintConfig(editor.id);

        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
        expect(editor.postedOfType("BpmnlintInPageQuery")).toHaveLength(1);
    });

    it("replays the last cached in-page event on re-instruct (panel re-activation)", async () => {
        const { service, host, editor } = createService();

        await service.setBpmnlintConfig(editor.id); // in-page, no cache yet
        service.applyWebviewLintResults(editor.id, RESULTS, []); // caches the event
        resetSurfaces(host);

        await service.setBpmnlintConfig(editor.id); // re-instruct

        // Cached findings are restored instead of a blank provisional state.
        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: undefined });
    });
});

describe("BpmnLintConfigService.applyWebviewLintResults", () => {
    async function inPageService() {
        const ctx = createService();
        await ctx.service.setBpmnlintConfig(ctx.editor.id); // flip to in-page
        resetSurfaces(ctx.host);
        return ctx;
    }

    it("publishes diagnostics, shows the default status, warns on unresolved, and caches", async () => {
        const { service, host, editor } = await inPageService();

        service.applyWebviewLintResults(editor.id, RESULTS, ["some-plugin/some-rule"]);

        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: undefined });
        expect(host.notifier.logged("warning")).toEqual([
            expect.stringContaining("some-plugin/some-rule"),
        ]);
    });

    it("publishes diagnostics but skips the status bar when the editor is not focused", async () => {
        const { service, host, editor } = await inPageService();
        editor.loseFocus();

        service.applyWebviewLintResults(editor.id, RESULTS, []);

        // The Problems panel is global, so diagnostics always publish...
        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        // ...but a background editor's push must not steal the visible status.
        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
    });

    it("ignores a push when linting is disabled", async () => {
        const { service, host, editor } = await inPageService();
        host.settings.values.lintingEnabled = false;

        service.applyWebviewLintResults(editor.id, RESULTS, []);

        expect(host.diagnostics.published.size).toBe(0);
    });

    it("logs a dropped push from a superseded config at debug level", async () => {
        const { service, host, editor } = await inPageService();

        service.applyWebviewLintResults(editor.id, RESULTS, [], "stale-token");

        expect(host.diagnostics.published.size).toBe(0);
        expect(host.notifier.logged("debug")).toContain(
            "[bpmnlint] dropping in-page results from a superseded config era",
        );
    });
});

describe("BpmnLintConfigService.setBpmnlintConfig — disabled", () => {
    it("skips linting and pushes the disabled state when linting is turned off", async () => {
        const { service, host, editor, lintRunner } = createService({ config: ESCALATING_RAW });
        host.settings.values.lintingEnabled = false;
        host.diagnostics.publish(editor.id, XML, STALE_RESULTS);

        const result = await service.setBpmnlintConfig(editor.id);

        expect(result).toBe(true);
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(host.diagnostics.published.has(editor.id)).toBe(false);
        expect(host.statusBar.bpmnlint).toEqual({ state: "disabled" });
        expect(service.getLintMode(editor.id)).toBe("external");
        expect(editor.postedOfType<BpmnLintDisabledQuery>("BpmnLintDisabledQuery")).toHaveLength(1);
    });

    it("leaves the status bar untouched when disabled and the editor is not focused", async () => {
        const { service, host, editor } = createService();
        host.settings.values.lintingEnabled = false;
        editor.loseFocus();

        await service.setBpmnlintConfig(editor.id);

        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
        expect(editor.postedOfType("BpmnLintDisabledQuery")).toHaveLength(1);
    });
});

describe("BpmnLintConfigService.clearDiagnostics", () => {
    it("forgets the negotiation so a re-open re-negotiates a fresh token", async () => {
        const { service, editor, token } = await coveredSession();

        service.clearDiagnostics(editor.id);
        await service.setBpmnlintConfig(editor.id);

        const msg = lastPosted<BpmnlintInPageQuery>(editor, "BpmnlintInPageQuery");
        expect(editor.postedOfType("BpmnlintInPageQuery")).toHaveLength(2);
        expect(msg?.configToken).not.toBe(token);
    });
});

describe("BpmnLintConfigService — a host lint that lands after its session moved on", () => {
    /** Starts a host lint of the escalating config that runs until the test settles it. */
    async function hostLintInFlight() {
        const ctx = createService({ config: ESCALATING_RAW });
        let finishLint!: (outcome: LintOutcome) => void;
        let failLint!: (error: Error) => void;
        ctx.lintRunner.lint.mockReturnValueOnce(
            new Promise((resolve, reject) => {
                finishLint = resolve;
                failLint = reject;
            }),
        );
        const linting = ctx.service.setBpmnlintConfig(ctx.editor.id);
        await flush();
        return { ...ctx, linting, finishLint, failLint };
    }

    it("publishes nothing for a diagram that closed while its host lint ran", async () => {
        const { service, host, editor, linting, finishLint } = await hostLintInFlight();

        service.clearDiagnostics(editor.id);
        finishLint({ results: RESULTS, unresolved: [] });
        await linting;

        expect(host.diagnostics.published.has(editor.id)).toBe(false);
        expect(editor.postedOfType("BpmnlintResultsQuery")).toHaveLength(0);
    });

    it("keeps the in-page default when the config was deleted while its host lint ran", async () => {
        const { service, host, editor, linting, finishLint } = await hostLintInFlight();

        host.workspace.files.delete(CONFIG_PATH);
        await service.setBpmnlintConfig(editor.id);
        finishLint({ results: RESULTS, unresolved: [] });
        await linting;

        expect(service.getLintMode(editor.id)).toBe("in-page");
        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: undefined });
        expect(editor.postedOfType("BpmnlintResultsQuery")).toHaveLength(0);
    });

    it("keeps linting off when it was turned off while a host lint ran", async () => {
        const { service, host, editor, linting, finishLint } = await hostLintInFlight();

        host.settings.values.lintingEnabled = false;
        await service.setBpmnlintConfig(editor.id);
        finishLint({ results: RESULTS, unresolved: [] });
        await linting;

        expect(host.statusBar.bpmnlint).toEqual({ state: "disabled" });
        expect(host.diagnostics.published.has(editor.id)).toBe(false);
    });

    it("keeps a newer covered config in-page when the older config's host lint fails", async () => {
        const { service, host, editor, linting, failLint } = await hostLintInFlight();

        host.workspace.files.set(CONFIG_PATH, COVERED_RAW);
        await service.setBpmnlintConfig(editor.id);
        const token = lastPosted<BpmnlintInPageQuery>(editor, "BpmnlintInPageQuery")?.configToken;
        failLint(new Error("plugin crashed"));
        await linting;

        expect(host.notifier.logged("error")).toEqual([expect.stringContaining("plugin crashed")]);
        expect(service.getLintMode(editor.id)).toBe("in-page");
        expect(host.statusBar.bpmnlint).toEqual({ state: "active", configPath: CONFIG_PATH });
        expect(editor.postedOfType("BpmnlintResultsQuery")).toHaveLength(0);
        service.applyWebviewLintResults(editor.id, RESULTS, [], token);
        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
    });
});

/** Runs the real participant and lifecycle, so closing an editor tears it down as the hosts do. */
function createSessionHost(files: Record<string, string> = {}) {
    const host = createTestHost({ folders: ["/work", "/other"], files });
    const locator = new BpmnLintConfigLocator(
        host.workspace,
        host.settings,
        new ArtifactService(host.workspace, host.settings),
    );
    const lintRunner = {
        lint: vi.fn().mockResolvedValue({ results: RESULTS, unresolved: [] }),
    };
    const service = new BpmnLintConfigService(
        host.store,
        host.documents,
        locator,
        lintRunner,
        host.diagnostics,
        host.statusBar,
        host.notifier,
        host.settings,
    );
    const participant = new BpmnlintParticipant(service, locator, host.statusBar, host.notifier);
    const openDiagram = async (path: string, focused: boolean, content = XML) => {
        const editor = await host.openSession(path, [participant], { content, focused });
        // What the loaded webview's GetBpmnlintConfigCommand runs.
        await service.setBpmnlintConfig(editor.id);
        return editor;
    };
    return { host, service, lintRunner, participant, openDiagram };
}

describe("BpmnLintConfigService — a diagram that closes while its lint config is discovered", () => {
    /** Holds the next file read until the test answers it. */
    function holdNextRead(host: TestHost): () => void {
        const readFile = host.workspace.readFile.bind(host.workspace);
        let answerRead: (() => void) | undefined;
        vi.spyOn(host.workspace, "readFile").mockImplementationOnce(
            (path) =>
                new Promise((resolve) => {
                    answerRead = () => resolve(readFile(path));
                }),
        );
        return () => answerRead?.();
    }

    it.each([
        { tier: "covered", config: COVERED_RAW },
        { tier: "escalated", config: ESCALATING_RAW },
    ])(
        "does not start a lint session for an editor that closes while its $tier config is read",
        async ({ config }) => {
            const { host, service, lintRunner, participant } = createSessionHost({
                [CONFIG_PATH]: config,
            });
            const editor = await host.openSession(PATH, [participant], { content: XML });
            const answerRead = holdNextRead(host);
            const discovery = service.setBpmnlintConfig(editor.id);
            await flush();

            editor.dispose();
            answerRead();
            await discovery;

            expect(service.getLintMode(editor.id)).toBe("external");
            expect(lintRunner.lint).not.toHaveBeenCalled();
            expect(host.notifier.logged("error")).toEqual([]);
            expect(host.notifier.logged("warning")).toEqual([]);
        },
    );

    it("does not lint a diagram that closes while a re-seed re-arms its config watcher", async () => {
        const { host, service, participant } = createSessionHost({ [CONFIG_PATH]: COVERED_RAW });
        const editor = await host.openSession(PATH, [participant], { content: XML });

        const reseeding = host.reseedSession(editor.id);
        editor.dispose();
        await reseeding;

        expect(service.getLintMode(editor.id)).toBe("external");
        expect(host.notifier.logged("error")).toEqual([]);
    });
});

describe("BpmnLintConfigService — the status item follows the focused editor", () => {
    // The real participant and lifecycle play VS Code's focus events: a text
    // editor taking focus blurs the panel, but the store's active-editor pointer
    // stays on the diagram because text editors are not sessions.
    async function blurredDiagramReLintedAfterConfigEdit() {
        const ctx = createSessionHost({ [CONFIG_PATH]: COVERED_RAW });
        const editor = await ctx.openDiagram(PATH, true);
        expect(ctx.host.statusBar.bpmnlint).toEqual({ state: "active", configPath: CONFIG_PATH });

        // The user edits .bpmnlintrc in a text editor beside the diagram.
        editor.loseFocus();
        expect(ctx.host.statusBar.bpmnlint).toEqual({ state: "hidden" });
        ctx.host.workspace.files.set(CONFIG_PATH, JSON.stringify({ extends: "bpmnlint:all" }));
        ctx.host.workspace.watchers[0].handlers.onChange?.(CONFIG_PATH);
        await flush();

        // The visible diagram's webview re-lints against the new version.
        const token = lastPosted<BpmnlintInPageQuery>(editor, "BpmnlintInPageQuery")?.configToken;
        ctx.service.applyWebviewLintResults(editor.id, RESULTS, [], token);
        return { ...ctx, editor };
    }

    it("keeps the lint status hidden when a blurred diagram's webview pushes results", async () => {
        const { host, editor } = await blurredDiagramReLintedAfterConfigEdit();

        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
    });

    it("leaves no lint status behind when that blurred diagram is closed", async () => {
        const { host, editor } = await blurredDiagramReLintedAfterConfigEdit();

        editor.dispose();

        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
    });

    it("shows the focused diagram's lint results, not those of a diagram resolved behind it", async () => {
        const { host, service, openDiagram } = createSessionHost();
        const focused = await openDiagram(PATH, true, XML_C7);
        const background = await openDiagram("/work/other.bpmn", false, XML_C8);

        service.applyWebviewLintResults(background.id, RESULTS, []);
        service.applyWebviewLintResults(focused.id, RESULTS, []);

        expect(focused.isActive()).toBe(true);
        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: "c7" });
    });

    it("keeps the focused diagram's lint status while a diagram behind it loads", async () => {
        const { host, openDiagram } = createSessionHost();
        await openDiagram(PATH, true, XML_C7);

        await openDiagram("/work/other.bpmn", false, XML_C8);

        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: "c7" });
    });

    it("keeps the newly focused diagram's status when the previous one's host lint finishes late", async () => {
        const { host, lintRunner, openDiagram } = createSessionHost({
            [CONFIG_PATH]: ESCALATING_RAW,
        });
        const previous = await openDiagram(PATH, true);
        let finishLint!: (outcome: LintOutcome) => void;
        lintRunner.lint.mockReturnValueOnce(new Promise((resolve) => (finishLint = resolve)));
        host.workspace.watchers[0].handlers.onChange?.(CONFIG_PATH);
        await flush();

        previous.loseFocus();
        await openDiagram("/other/next.bpmn", true);
        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: undefined });
        finishLint({ results: RESULTS, unresolved: [] });
        await flush();

        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: undefined });
    });
});
