import { describe, expect, it, vi } from "vitest";

import {
    BpmnLintDisabledQuery,
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost, FakeEditorHandle, TestHost } from "../../../testing";
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
// A string moddleExtension is a Node-only module path → the static pre-check
// escalates immediately (today's host-side behaviour).
const ESCALATING_CONFIG = {
    extends: "bpmnlint:recommended",
    moddleExtensions: { acme: "./acme.json" },
};
const ESCALATING_RAW = JSON.stringify(ESCALATING_CONFIG);

/** Lets a fire-and-forget `runWorkspaceLint` settle before assertions. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function createService(content = XML) {
    const host = createTestHost();
    const editor = host.openEditor(PATH, content);
    const locator = {
        findNearestConfig: vi.fn().mockResolvedValue(undefined),
        readConfig: vi.fn(),
    };
    const lintRunner = {
        lint: vi.fn().mockResolvedValue({ results: RESULTS, unresolved: [] }),
    };

    const service = new BpmnLintConfigService(
        host.store,
        host.documents,
        locator as never,
        lintRunner,
        host.diagnostics,
        host.statusBar,
        host.notifier,
        host.settings,
    );

    return { service, host, editor, locator, lintRunner };
}

/** Forgets what the status bar and Problems panel show, so a later step's effect stands alone. */
function resetSurfaces(host: TestHost): void {
    host.statusBar.hideBpmnlintStatus();
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
    const ctx = createService();
    ctx.locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
    ctx.locator.readConfig.mockResolvedValue(COVERED_RAW);
    await ctx.service.setBpmnlintConfig(ctx.editor.id);
    const instruction = lastPosted<BpmnlintInPageQuery>(ctx.editor, "BpmnlintInPageQuery");
    return { ...ctx, token: instruction?.configToken as string };
}

describe("BpmnLintConfigService.setBpmnlintConfig — escalated workspace config (Node run)", () => {
    it("lints host-side and posts the results with the active status when the config needs the Node resolver", async () => {
        const { service, host, editor, locator, lintRunner } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);

        const result = await service.setBpmnlintConfig(editor.id);

        expect(result).toBe(true);
        // Discovery walks from the document's directory, not the file itself.
        expect(locator.findNearestConfig).toHaveBeenCalledWith("/work");
        expect(lintRunner.lint).toHaveBeenCalledWith(XML, CONFIG_PATH, ESCALATING_CONFIG);
        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        expect(host.statusBar.bpmnlint).toEqual({ state: "active", configPath: CONFIG_PATH });
        expect(host.notifier.logged("info")).toContain(`bpmnlint applied from ${CONFIG_PATH}`);
        expect(service.getLintMode(editor.id)).toBe("external");
        // Escalation runs host-side — no in-page instruction is ever posted.
        expect(editor.postedOfType("BpmnlintInPageQuery")).toHaveLength(0);
        const [msg] = editor.postedOfType<BpmnlintResultsQuery>("BpmnlintResultsQuery");
        expect(msg.results).toEqual(RESULTS);
    });

    it("shows the unresolved status and warns when rules could not be resolved", async () => {
        const { service, host, editor, locator, lintRunner } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        lintRunner.lint.mockResolvedValue({ results: {}, unresolved: ["custom/x"] });

        await service.setBpmnlintConfig(editor.id);

        expect(host.statusBar.bpmnlint).toEqual({
            state: "unresolved",
            configPath: CONFIG_PATH,
            unresolved: ["custom/x"],
        });
        expect(host.notifier.logged("warning")).toEqual([expect.stringContaining("custom/x")]);
    });

    it("still posts results but leaves the status bar untouched when reflectInStatusBar is false", async () => {
        const { service, host, editor, locator } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);

        const result = await service.setBpmnlintConfig(editor.id, false);

        expect(result).toBe(true);
        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
        const [msg] = editor.postedOfType<BpmnlintResultsQuery>("BpmnlintResultsQuery");
        expect(msg.results).toEqual(RESULTS);
    });

    it("re-lints via the Node path on a cache-hit re-run and posts no new in-page instruction", async () => {
        const { service, editor, locator, lintRunner } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        await service.setBpmnlintConfig(editor.id);
        expect(lintRunner.lint).toHaveBeenCalledTimes(1);

        await service.setBpmnlintConfig(editor.id);

        // The document may have changed, so it re-lints — but the version is
        // unchanged, so it does not re-negotiate or post a fresh instruction.
        expect(lintRunner.lint).toHaveBeenCalledTimes(2);
        expect(editor.postedOfType("BpmnlintInPageQuery")).toHaveLength(0);
    });

    it("logs and falls back to null without throwing on malformed JSON", async () => {
        const { service, host, editor, locator } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue("{ not json");
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

    it("swallows a hidden-panel post rejection as a warning without misreporting it as a read failure", async () => {
        const { service, host, editor, locator } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
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
        const { service, host, editor, locator, lintRunner } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(COVERED_RAW);
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
});

describe("BpmnLintConfigService — escalation from a covered in-page run", () => {
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
        // Node lint hangs, so the mode is still "in-page" — the decision flip is
        // the only guard against a second event re-escalating.
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
        release?.();
        await flush();
    });
});

describe("BpmnLintConfigService.setBpmnlintConfig — no config (in-page default)", () => {
    it("instructs the webview to run in-page, does not lint host-side, and posts no results query", async () => {
        const { service, host, editor, locator, lintRunner } = createService();
        locator.findNearestConfig.mockResolvedValue(undefined);
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

    it("reflects the detected platform in the provisional status (C7)", async () => {
        const { service, host, editor } = createService(XML_C7);

        await service.setBpmnlintConfig(editor.id);

        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: "c7" });
    });

    it("reflects the detected platform in the provisional status (C8)", async () => {
        const { service, host, editor } = createService(XML_C8);

        await service.setBpmnlintConfig(editor.id);

        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: "c8" });
    });

    it("leaves the status bar untouched when reflectInStatusBar is false", async () => {
        const { service, host, editor } = createService();

        await service.setBpmnlintConfig(editor.id, false);

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

    it("publishes diagnostics but skips the status bar when the editor is not active", async () => {
        const { service, host, editor } = await inPageService();
        host.openEditor("/other.bpmn");

        service.applyWebviewLintResults(editor.id, RESULTS, []);

        // The Problems panel is global, so diagnostics always publish...
        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
        // ...but a background editor's push must not steal the visible status.
        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
    });

    it("ignores a push when the editor is on the external path (default)", () => {
        const { service, host, editor } = createService();

        service.applyWebviewLintResults(editor.id, RESULTS, []);

        expect(host.diagnostics.published.size).toBe(0);
    });

    it("ignores a push when linting is disabled", async () => {
        const { service, host, editor } = await inPageService();
        host.settings.values.lintingEnabled = false;

        service.applyWebviewLintResults(editor.id, RESULTS, []);

        expect(host.diagnostics.published.size).toBe(0);
    });

    it("drops a default-tier push that carries a token (a deleted-config era)", async () => {
        const { service, host, editor } = await inPageService();

        service.applyWebviewLintResults(editor.id, RESULTS, [], "stale-token");

        expect(host.diagnostics.published.size).toBe(0);
        expect(host.notifier.logged("debug")).toContainEqual(expect.stringContaining("superseded"));
    });

    it("ignores a stale in-page push after an escalating workspace-config takeover", async () => {
        const { service, host, editor, locator } = createService();
        await service.setBpmnlintConfig(editor.id); // in-page default

        // An escalating config appears — the mode flips to external before the push.
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        await service.setBpmnlintConfig(editor.id);
        expect(service.getLintMode(editor.id)).toBe("external");

        // A default-tier webview push already in flight arrives late — dropped.
        service.applyWebviewLintResults(editor.id, STALE_RESULTS, []);
        expect(host.diagnostics.published.get(editor.id)).toEqual(RESULTS);
    });
});

describe("BpmnLintConfigService — re-negotiation (both directions + race)", () => {
    it("mints a new-token in-page instruction when an escalated config becomes covered", async () => {
        const { service, editor, locator, lintRunner } = createService();
        locator.findNearestConfig.mockResolvedValue(CONFIG_PATH);
        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        await service.setBpmnlintConfig(editor.id); // escalated (external)
        expect(service.getLintMode(editor.id)).toBe("external");
        lintRunner.lint.mockClear();

        locator.readConfig.mockResolvedValue(COVERED_RAW);
        await service.setBpmnlintConfig(editor.id); // edited → covered

        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(service.getLintMode(editor.id)).toBe("in-page");
        const [msg] = editor.postedOfType<BpmnlintInPageQuery>("BpmnlintInPageQuery");
        expect(msg.config).toEqual(COVERED_CONFIG);
        expect(typeof msg.configToken).toBe("string");
    });

    it("escalates when a covered config becomes uncovered", async () => {
        const { service, editor, locator, lintRunner } = await coveredSession();

        locator.readConfig.mockResolvedValue(ESCALATING_RAW);
        await service.setBpmnlintConfig(editor.id); // edited → needs the Node resolver

        expect(lintRunner.lint).toHaveBeenCalledWith(XML, CONFIG_PATH, ESCALATING_CONFIG);
        expect(service.getLintMode(editor.id)).toBe("external");
    });

    it("hands back to the payload-free default and forgets the negotiation when the config is deleted", async () => {
        const { service, host, editor, locator } = await coveredSession();

        locator.findNearestConfig.mockResolvedValue(undefined); // config deleted
        await service.setBpmnlintConfig(editor.id);

        expect(service.getLintMode(editor.id)).toBe("in-page");
        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: undefined });
        const msg = lastPosted<BpmnlintInPageQuery>(editor, "BpmnlintInPageQuery");
        expect(msg?.config).toBeUndefined();
        expect(msg?.configToken).toBeUndefined();

        // Negotiation gone: a default-tier event with the old token is now dropped.
        service.applyWebviewLintResults(editor.id, RESULTS, [], "old-token");
        expect(host.diagnostics.published.size).toBe(0);
        expect(host.notifier.logged("debug")).toContain(
            "[bpmnlint] dropping in-page results from a superseded config era",
        );
    });

    it("drops a stale-token event without escalating when the config was edited mid-flight", async () => {
        const { service, host, editor, locator, lintRunner, token } = await coveredSession();

        // Config edited V1 → V2 (still covered) before V1's in-page run returns.
        locator.readConfig.mockResolvedValue(JSON.stringify({ ...COVERED_CONFIG, rules: {} }));
        await service.setBpmnlintConfig(editor.id);
        const token2 = lastPosted<BpmnlintInPageQuery>(editor, "BpmnlintInPageQuery")?.configToken;
        expect(token2).not.toBe(token);

        // A late V1 run (old token) reports it could not cover a rule.
        service.applyWebviewLintResults(editor.id, RESULTS, ["p/r"], token);

        // Dropped as stale — it must not escalate the current V2 (still in-page).
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(host.diagnostics.published.size).toBe(0);
        expect(service.getLintMode(editor.id)).toBe("in-page");
    });

    it("reuses the settled decision (same token) across disable → re-enable", async () => {
        const { service, host, editor, token } = await coveredSession();

        host.settings.values.lintingEnabled = false;
        await service.setBpmnlintConfig(editor.id); // disabled — negotiation retained

        host.settings.values.lintingEnabled = true;
        await service.setBpmnlintConfig(editor.id); // re-enabled — same version

        const msg = lastPosted<BpmnlintInPageQuery>(editor, "BpmnlintInPageQuery");
        expect(editor.postedOfType("BpmnlintInPageQuery")).toHaveLength(2);
        expect(msg?.configToken).toBe(token); // reused, not re-minted
    });

    it("forgets the negotiation on clearDiagnostics so a re-open re-negotiates a fresh token", async () => {
        const { service, editor, token } = await coveredSession();

        service.clearDiagnostics(editor.id);
        await service.setBpmnlintConfig(editor.id);

        const msg = lastPosted<BpmnlintInPageQuery>(editor, "BpmnlintInPageQuery");
        expect(editor.postedOfType("BpmnlintInPageQuery")).toHaveLength(2);
        expect(msg?.configToken).not.toBe(token);
    });
});

describe("BpmnLintConfigService.setBpmnlintConfig — disabled", () => {
    it("skips linting and pushes the disabled state when linting is turned off", async () => {
        const { service, host, editor, locator, lintRunner } = createService();
        host.settings.values.lintingEnabled = false;
        host.diagnostics.publish(editor.id, XML, STALE_RESULTS);

        const result = await service.setBpmnlintConfig(editor.id);

        expect(result).toBe(true);
        // The gate short-circuits before any config discovery or lint run.
        expect(locator.findNearestConfig).not.toHaveBeenCalled();
        expect(lintRunner.lint).not.toHaveBeenCalled();
        expect(host.diagnostics.published.has(editor.id)).toBe(false);
        expect(host.statusBar.bpmnlint).toEqual({ state: "disabled" });
        expect(service.getLintMode(editor.id)).toBe("external");
        expect(editor.postedOfType<BpmnLintDisabledQuery>("BpmnLintDisabledQuery")).toHaveLength(1);
    });

    it("leaves the status bar untouched when disabled and reflectInStatusBar is false", async () => {
        const { service, host, editor } = createService();
        host.settings.values.lintingEnabled = false;

        await service.setBpmnlintConfig(editor.id, false);

        expect(host.statusBar.bpmnlint).toEqual({ state: "hidden" });
        expect(editor.postedOfType("BpmnLintDisabledQuery")).toHaveLength(1);
    });

    it("clears the cached in-page event so a re-instruct does not replay stale findings", async () => {
        const { service, host, editor } = createService();
        await service.setBpmnlintConfig(editor.id); // in-page
        service.applyWebviewLintResults(editor.id, RESULTS, []); // cache an event

        // User disables linting — the cache is dropped (external mode).
        host.settings.values.lintingEnabled = false;
        await service.setBpmnlintConfig(editor.id);

        // Re-enable + no config → in-page again, but with no cached event to
        // replay: back to the provisional (blank) state.
        host.settings.values.lintingEnabled = true;
        await service.setBpmnlintConfig(editor.id);

        expect(host.diagnostics.published.has(editor.id)).toBe(false);
        expect(host.statusBar.bpmnlint).toEqual({ state: "default", platform: undefined });
    });
});
