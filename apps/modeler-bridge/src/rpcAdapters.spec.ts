import { posix } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
    ChoicePrompt,
    DEFAULT_MODELER_SETTINGS,
    DeploymentStatePatch,
    LocateResult,
    SearchPrompt,
    SettingChange,
} from "@miragon/bpmn-modeler-core";
import { readSettingsSnapshot } from "@miragon/bpmn-modeler-core/testing";

import { settle } from "./__fixtures__/bridgeHarness";
import { DocumentMirror } from "./editorSession/domain/DocumentMirror";
import { RpcActionNotifier } from "./kernel/adapter/out/RpcActionNotifier";
import { RpcClipboard } from "./kernel/adapter/out/RpcClipboard";
import { RpcDeploymentState } from "./deployment/adapter/out/RpcDeploymentState";
import { RpcEditorHandle } from "./editorSession/adapter/out/RpcEditorHandle";
import { RpcLintingPreference } from "./modeler/bpmn/adapter/out/RpcLintingPreference";
import { RpcNotifier } from "./kernel/adapter/out/RpcNotifier";
import { RpcPicker } from "./kernel/adapter/out/RpcPicker";
import { RpcSecretStore } from "./deployment/adapter/out/RpcSecretStore";
import { RpcStatusBar } from "./kernel/adapter/out/RpcStatusBar";
import { RpcMarketplacePrompt } from "./templateMarketplace/adapter/out/RpcMarketplacePrompt";
import { RpcMarketplaceRegistrations } from "./templateMarketplace/adapter/out/RpcMarketplaceRegistrations";
import { RpcTokenPrompt } from "./templateMarketplace/adapter/out/RpcTokenPrompt";
import { BridgeSettings } from "./kernel/adapter/out/BridgeSettings";
import { SessionMeta } from "./protocol/domain/types";
import { Rpc } from "./transport/adapter/out/Rpc";

const META: SessionMeta = {
    editorId: "file:///w/a.bpmn",
    sessionId: 9,
    uriString: "file:///w/a.bpmn",
    path: "/w/a.bpmn",
    fsPath: "/w/a.bpmn",
    scheme: "file",
    workspaceRoot: "/w",
};

const PLUGIN_CACHE = "/idea-system/miragon-bpmn-modeler/bpmn-plugins";

/** Returns the last element (ES2021 target has no `Array.prototype.at`). */
function last<T>(items: T[]): T {
    return items[items.length - 1];
}

function errorThrownInDeploy(message: string): Error {
    const error = new Error(message);
    error.stack = `Error: ${message}\n    at deploy (DeploymentService.ts:42:7)`;
    return error;
}

/** Captures emitted frames and lets a test answer the latest outstanding request. */
function harness() {
    const frames: any[] = [];
    const rpc = new Rpc((line) => frames.push(JSON.parse(line)));
    const answerLast = (result: unknown) =>
        rpc.handleLine(JSON.stringify({ id: last(frames).id, result }));
    return { frames, rpc, answerLast };
}

describe("DocumentMirror", () => {
    it("serves seeded content and reflects later updates", () => {
        const mirror = new DocumentMirror();
        mirror.register(META, "<bpmn/>");
        expect(mirror.content(META.editorId)).toBe("<bpmn/>");

        mirror.setContent(META.editorId, "<bpmn2/>");
        expect(mirror.content(META.editorId)).toBe("<bpmn2/>");
    });

    it("returns empty content for an unknown editor", () => {
        expect(new DocumentMirror().content("missing")).toBe("");
    });

    it("require throws for an unknown editor but peek tolerates it", () => {
        const mirror = new DocumentMirror();
        expect(() => mirror.require("missing")).toThrow(/No session metadata/);
        expect(mirror.peek("missing")).toBeUndefined();
    });

    it("remove drops both metadata and text", () => {
        const mirror = new DocumentMirror();
        mirror.register(META, "x");
        mirror.remove(META.editorId);
        expect(mirror.peek(META.editorId)).toBeUndefined();
        expect(mirror.content(META.editorId)).toBe("");
    });

    it("completeWrite mirrors an accepted change and notifies content listeners", () => {
        const mirror = new DocumentMirror();
        mirror.register(META, "old");
        const changedEditors: string[] = [];
        mirror.onDidChangeContent((editorId) => changedEditors.push(editorId));

        const changed = mirror.completeWrite(META.editorId, META.sessionId, "new", {
            changed: true,
            accepted: true,
        });

        expect(changed).toBe(true);
        expect(mirror.content(META.editorId)).toBe("new");
        expect(changedEditors).toEqual([META.editorId]);
    });

    it("completeWrite prefers the host-normalised bytes", () => {
        const mirror = new DocumentMirror();
        mirror.register(META, "old");

        mirror.completeWrite(META.editorId, META.sessionId, "<xml/>\r\n", {
            changed: true,
            accepted: true,
            normalizedContent: "<xml/>\n",
        });

        expect(mirror.content(META.editorId)).toBe("<xml/>\n");
    });

    it("completeWrite leaves the mirror untouched for unchanged, rejected or missing replies", () => {
        const mirror = new DocumentMirror();
        mirror.register(META, "host");
        const listener = vi.fn();
        mirror.onDidChangeContent(listener);

        expect(mirror.completeWrite(META.editorId, META.sessionId, "a", { changed: false })).toBe(
            false,
        );
        expect(
            mirror.completeWrite(META.editorId, META.sessionId, "b", {
                changed: true,
                accepted: false,
            }),
        ).toBe(false);
        expect(mirror.completeWrite(META.editorId, META.sessionId, "c", null)).toBe(false);

        expect(mirror.content(META.editorId)).toBe("host");
        expect(listener).not.toHaveBeenCalled();
    });
});

describe("RpcEditorHandle", () => {
    it("reports a focus change the store drives through setActive once, not again on a repeat", () => {
        const handle = new RpcEditorHandle(
            META,
            new DocumentMirror(),
            new Rpc(() => {}),
            new BridgeSettings(),
            PLUGIN_CACHE,
        );
        const focus: boolean[] = [];
        handle.onDidChangeActive((active) => focus.push(active));

        handle.setActive(true);
        handle.setActive(true);
        handle.setActive(false);

        expect(focus).toEqual([true, false]);
        expect(handle.isActive()).toBe(false);
    });

    it("postMessage forwards an editor/postMessage notification", async () => {
        const { frames, rpc } = harness();
        const handle = new RpcEditorHandle(
            META,
            new DocumentMirror(),
            rpc,
            new BridgeSettings(),
            PLUGIN_CACHE,
        );

        await handle.postMessage({ type: "BpmnFileQuery" } as never);

        expect(last(frames)).toEqual({
            method: "editor/postMessage",
            params: {
                editorId: META.editorId,
                sessionId: META.sessionId,
                message: { type: "BpmnFileQuery" },
            },
        });
    });

    it("sends document/write without a causation revision and mirrors the accepted write", async () => {
        const { frames, rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "old");
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings(), PLUGIN_CACHE);

        const pending = handle.writeContent("new", 4);
        expect(last(frames)).toEqual({
            id: last(frames).id,
            method: "document/write",
            params: {
                editorId: META.editorId,
                sessionId: META.sessionId,
                content: "new",
                expectedDocumentRevision: 4,
            },
        });
        await answerLast({ changed: true, accepted: true });

        await expect(pending).resolves.toBe(true);
        expect(mirror.content(META.editorId)).toBe("new");
    });

    it("keeps authoritative mirror content when the host rejects a stale write", async () => {
        const { rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "host");
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings(), PLUGIN_CACHE);

        const pending = handle.writeContent("stale", 2);
        await answerLast({ changed: false, accepted: false });

        await expect(pending).resolves.toBe(false);
        expect(mirror.content(META.editorId)).toBe("host");
    });

    it("keeps authoritative mirror bytes after an accepted no-op write", async () => {
        const { rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "<xml/>\n");
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings(), PLUGIN_CACHE);

        const pending = handle.writeContent("<xml/>\r\n", 0);
        await answerLast({ changed: false, accepted: true });

        await expect(pending).resolves.toBe(false);
        expect(mirror.content(META.editorId)).toBe("<xml/>\n");
    });

    it("does not let a late write response overwrite a replacement session", async () => {
        const { rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "old");
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings(), PLUGIN_CACHE);

        const pending = handle.writeContent("stale", 0);
        mirror.remove(META.editorId);
        mirror.register({ ...META, sessionId: 10 }, "replacement");
        await answerLast({ changed: true, accepted: true });

        await expect(pending).resolves.toBe(true);
        expect(mirror.content(META.editorId)).toBe("replacement");
    });

    // Only the host's error reply reads as a refused write.
    it("answers a write the host fails with an error reply with false and keeps the mirror", async () => {
        const { frames, rpc } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "host");
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings(), PLUGIN_CACHE);

        const pending = handle.writeContent("next", 1);
        await rpc.handleLine(JSON.stringify({ id: last(frames).id, error: "edit failed" }));

        await expect(pending).resolves.toBe(false);
        expect(mirror.content(META.editorId)).toBe("host");
    });

    it("rejects a write the host can no longer answer", async () => {
        const { rpc } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "host");
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings(), PLUGIN_CACHE);

        const pending = handle.writeContent("next", 1);
        rpc.handleEnd();

        await expect(pending).rejects.toThrow("No reply to document/write: the input ended");
        expect(mirror.content(META.editorId)).toBe("host");
    });

    it("save requests document/save and returns the saved flag", async () => {
        const { frames, rpc, answerLast } = harness();
        const handle = new RpcEditorHandle(
            META,
            new DocumentMirror(),
            rpc,
            new BridgeSettings(),
            PLUGIN_CACHE,
        );

        const pending = handle.save();
        expect(last(frames)).toMatchObject({ method: "document/save" });
        await answerLast({ saved: true });

        await expect(pending).resolves.toBe(true);
    });
});

describe("BridgeSettings", () => {
    it("gives every instance lists of its own", () => {
        const defaults = structuredClone(readSettingsSnapshot(new BridgeSettings()));

        new BridgeSettings().getFavouriteBpmnElements().push("bpmn:Task");
        new BridgeSettings().getMarketplaces().push("https://github.com/acme/templates");

        expect(readSettingsSnapshot(new BridgeSettings())).toEqual(defaults);
    });

    it("fires no change for values that read as the current ones", () => {
        const settings = new BridgeSettings();
        const listener = vi.fn();
        settings.onDidChange(listener);

        settings.apply({ colorTheme: "dark", defaultMode: "edit", configFolder: " " });

        expect(listener).not.toHaveBeenCalled();
    });

    it("keeps the values a partial snapshot leaves out", () => {
        const settings = new BridgeSettings();
        settings.apply({ language: "de", configFolder: ".config" });

        settings.apply({ language: "fr" });

        expect(readSettingsSnapshot(settings)).toEqual({
            ...DEFAULT_MODELER_SETTINGS,
            language: "fr",
            configFolder: ".config",
        });
    });

    it("names only the settings that actually changed", () => {
        const settings = new BridgeSettings();
        const events: SettingChange[] = [];
        settings.onDidChange((event) => events.push(event));

        settings.apply({ language: "de", alignToOrigin: false }); // alignToOrigin already false

        expect(events).toHaveLength(1);
        expect(events[0].affects("language")).toBe(true);
        expect(events[0].affects("alignToOrigin")).toBe(false);
        expect(events[0].affects("configFolder")).toBe(false);
    });

    it("does not fire when the snapshot is unchanged", () => {
        const settings = new BridgeSettings();
        const listener = vi.fn();
        settings.onDidChange(listener);

        settings.apply({ language: "en" }); // matches the default

        expect(listener).not.toHaveBeenCalled();
    });

    it("reports linting.enabled when the host pushes it", () => {
        const settings = new BridgeSettings();
        const events: SettingChange[] = [];
        settings.onDidChange((event) => events.push(event));

        settings.apply({ lintingEnabled: false });

        expect(settings.getLintingEnabled()).toBe(false);
        expect(events.map((event) => event.affects("linting.enabled"))).toEqual([true]);
    });

    it("reports automatic preview changes once under the central setting key", () => {
        const settings = new BridgeSettings();
        const events: SettingChange[] = [];
        settings.onDidChange((event) => events.push(event));
        settings.apply({ formPreviewAutomatic: false });
        settings.apply({ formPreviewAutomatic: false });
        expect(settings.getFormPreviewAutomatic()).toBe(false);
        expect(events.map((event) => event.affects("formPreview.automatic"))).toEqual([true]);
    });

    it("reports a changed follow-name choice once, under its central key", () => {
        const settings = new BridgeSettings();
        const events: SettingChange[] = [];
        settings.onDidChange((event) => events.push(event));

        settings.apply({ elementIdsFollowName: true });
        settings.apply({ elementIdsFollowName: true });

        expect(settings.getElementIdsFollowName()).toBe(true);
        expect(events.map((event) => event.affects("elementIds.followName"))).toEqual([true]);
    });
});

describe("RpcLintingPreference", () => {
    it("asks the host to store the choice and settles on its ack", async () => {
        const { frames, rpc, answerLast } = harness();

        const stored = new RpcLintingPreference(rpc).setLintingEnabled(false);
        expect(last(frames)).toMatchObject({
            method: "settings/setLintingEnabled",
            params: { enabled: false },
        });
        await answerLast(null);

        await expect(stored).resolves.toBeUndefined();
    });

    it("rejects when the host fails to store the choice", async () => {
        const { frames, rpc } = harness();
        const stored = new RpcLintingPreference(rpc).setLintingEnabled(false);

        await rpc.handleLine(JSON.stringify({ id: last(frames).id, error: "store failed" }));

        await expect(stored).rejects.toThrow("store failed");
    });
});

describe("RpcDeploymentState", () => {
    const revision = { fingerprint: "f", deployedAt: "2026-09-17T14:32:00.000Z" };
    const DEV_ROW = "target:dev@localhost:8080::/a.bpmn";
    const PROD_ROW = "target:prod@localhost:8080::/a.bpmn";

    it("serves the seeded state through the synchronous load", () => {
        const state = new RpcDeploymentState(new Rpc(() => {}));
        state.seed({ endpoint: "https://engine", tenantId: "t1", authType: "basic" });

        expect(state.load()).toMatchObject({
            endpoint: "https://engine",
            tenantId: "t1",
            authType: "basic",
        });
    });

    it("replaces the mirror on a seed and reads what the host did not store as the defaults", () => {
        const state = new RpcDeploymentState(new Rpc(() => {}));
        state.seed({ endpoint: "https://engine", activeTargetName: "dev" });

        state.seed({ authType: "kerberos", ledger: { "target:dev::/a.bpmn": revision } });

        expect(state.load()).toEqual({
            endpoint: "",
            tenantId: "",
            authType: "none",
            tokenEndpoint: "",
            audience: "",
            activeTargetName: "",
            ledger: { "target:dev::/a.bpmn": revision },
        });
    });

    it("sends a save as one acknowledged request and applies it to the mirror once the host accepted it", async () => {
        const { frames, rpc, answerLast } = harness();
        const state = new RpcDeploymentState(rpc);
        state.seed({ ledger: { [DEV_ROW]: revision, [PROD_ROW]: revision } });
        const stored = state.load();
        const patch: DeploymentStatePatch = {
            endpoint: "https://engine",
            authType: "oauth2",
            ledger: { remove: [DEV_ROW] },
        };

        const pending = state.save(patch);
        // The persist is a request (has an id), not a fire-and-forget notification.
        expect(last(frames)).toMatchObject({ method: "deploymentState/save", params: { patch } });
        expect(last(frames).id).toBeTypeOf("number");
        expect(state.load()).toEqual(stored);

        await answerLast(null);
        await expect(pending).resolves.toBeUndefined();
        expect(state.load()).toEqual({
            ...stored,
            endpoint: "https://engine",
            authType: "oauth2",
            ledger: { [PROD_ROW]: revision },
        });
    });

    it.each<{ write: string; patch: DeploymentStatePatch }>([
        { write: "a deployed revision", patch: { ledger: { put: { [PROD_ROW]: revision } } } },
        { write: "a forgotten revision", patch: { ledger: { remove: [DEV_ROW] } } },
        {
            write: "the ad-hoc connection",
            patch: {
                endpoint: "https://other",
                tenantId: "t2",
                authType: "oauth2",
                tokenEndpoint: "https://token",
                audience: "aud",
            },
        },
        { write: "the active target", patch: { activeTargetName: "prod" } },
    ])("keeps what the host stored when the host rejects $write", async ({ patch }) => {
        const { frames, rpc } = harness();
        const state = new RpcDeploymentState(rpc);
        state.seed({
            endpoint: "https://engine",
            authType: "basic",
            activeTargetName: "dev",
            ledger: { [DEV_ROW]: revision },
        });
        const stored = state.load();

        const pending = state.save(patch);
        await rpc.handleLine(JSON.stringify({ id: last(frames).id, error: "disk full" }));

        await expect(pending).rejects.toThrow("disk full");
        expect(state.load()).toEqual(stored);
    });

    it("keeps both of two overlapping saves the host accepted", async () => {
        const { frames, rpc, answerLast } = harness();
        const state = new RpcDeploymentState(rpc);

        const first = state.save({ ledger: { put: { [DEV_ROW]: revision } } });
        const firstId = last(frames).id;
        const second = state.save({ ledger: { put: { [PROD_ROW]: revision } } });
        await rpc.handleLine(JSON.stringify({ id: firstId, result: null }));
        await answerLast(null);
        await Promise.all([first, second]);

        expect(state.load().ledger).toEqual({ [DEV_ROW]: revision, [PROD_ROW]: revision });
    });
});

describe("RpcActionNotifier", () => {
    it("rejects an answer naming an action the notice does not offer", async () => {
        const { rpc, answerLast } = harness();
        const offered = new RpcActionNotifier(rpc).offer({
            id: "reviewNotice",
            tone: "info",
            message: "1 new plugin",
            actions: [{ label: "Review…", value: "review" }],
        });

        await answerLast({ chosen: 1 });

        await expect(offered).rejects.toThrow('chose action 1 of notice "reviewNotice"');
    });
});

describe("RpcNotifier", () => {
    it("forwards each user-facing and diagnostic call to a host frame", () => {
        const { frames, rpc } = harness();
        const notifier = new RpcNotifier(rpc);

        notifier.showInfo("done");
        expect(last(frames)).toEqual({ method: "notifier/showInfo", params: { message: "done" } });

        notifier.showWarning("careful");
        expect(last(frames)).toEqual({
            method: "notifier/showWarning",
            params: { message: "careful" },
        });

        notifier.showError("boom");
        expect(last(frames)).toEqual({
            method: "notifier/showError",
            params: { message: "boom" },
        });

        notifier.logDebug("trace");
        expect(last(frames)).toEqual({
            method: "notifier/log",
            params: { level: "debug", message: "trace" },
        });

        notifier.logInfo("step");
        expect(last(frames)).toEqual({
            method: "notifier/log",
            params: { level: "info", message: "step" },
        });

        notifier.logWarning("careful");
        expect(last(frames)).toEqual({
            method: "notifier/log",
            params: { level: "warn", message: "careful" },
        });

        // A bare string (e.g. a webview-forwarded stack) is forwarded verbatim,
        // not re-wrapped in an Error.
        notifier.logError("[webview] raw stack");
        expect(last(frames)).toEqual({
            method: "notifier/log",
            params: { level: "error", message: "[webview] raw stack" },
        });

        notifier.openLoggingConsole();
        expect(last(frames)).toEqual({ method: "notifier/openConsole", params: {} });
    });

    it("logs an error with its stack so the throw site reaches idea.log", () => {
        const { frames, rpc } = harness();
        const error = errorThrownInDeploy("bad");

        new RpcNotifier(rpc).logError(error);

        expect(last(frames)).toEqual({
            method: "notifier/log",
            params: { level: "error", message: error.stack },
        });
    });

    it("logs the context with the stack and shows the context above the message", () => {
        const { frames, rpc } = harness();
        const error = errorThrownInDeploy("kaput");

        new RpcNotifier(rpc).notifyError("While loading", error);

        expect(frames).toEqual([
            {
                method: "notifier/log",
                params: { level: "error", message: `While loading: ${error.stack}` },
            },
            {
                method: "notifier/showError",
                params: { message: "While loading\nkaput" },
            },
        ]);
    });

    it("shows a thrown string in the error balloon below the context", () => {
        const { frames, rpc } = harness();
        const thrownString = "EACCES" as unknown as Error;

        new RpcNotifier(rpc).notifyError("Reading the element templates failed", thrownString);

        expect(frames).toEqual([
            {
                method: "notifier/log",
                params: { level: "error", message: "Reading the element templates failed: EACCES" },
            },
            {
                method: "notifier/showError",
                params: { message: "Reading the element templates failed\nEACCES" },
            },
        ]);
    });

    it.each([
        { error: new Error("bad"), logged: "Error: bad" },
        { error: new TypeError("bad"), logged: "TypeError: bad" },
    ])(
        "falls back to name and message when an error has no stack: $logged",
        ({ error, logged }) => {
            const { frames, rpc } = harness();
            delete error.stack;

            new RpcNotifier(rpc).logError(error);

            expect(last(frames)).toEqual({
                method: "notifier/log",
                params: { level: "error", message: logged },
            });
        },
    );
});

describe("RpcSecretStore", () => {
    it("routes saves and reads over secretStore/* request frames", async () => {
        const { frames, rpc, answerLast } = harness();
        const store = new RpcSecretStore(rpc);

        const saveBasic = store.saveBasicAuth("user", "pw");
        expect(last(frames)).toMatchObject({
            method: "secretStore/saveBasicAuth",
            params: { username: "user", password: "pw" },
        });
        await answerLast(null);
        await expect(saveBasic).resolves.toBeUndefined();

        const getBasic = store.getBasicAuth();
        expect(last(frames)).toMatchObject({ method: "secretStore/getBasicAuth", params: {} });
        await answerLast({ username: "user", password: "pw" });
        await expect(getBasic).resolves.toEqual({ username: "user", password: "pw" });

        const saveOauth = store.saveOAuth2("client", "secret");
        expect(last(frames)).toMatchObject({
            method: "secretStore/saveOAuth2",
            params: { clientId: "client", clientSecret: "secret" },
        });
        await answerLast(null);
        await expect(saveOauth).resolves.toBeUndefined();

        const getOauth = store.getOAuth2();
        expect(last(frames)).toMatchObject({ method: "secretStore/getOAuth2", params: {} });
        await answerLast({ clientId: "client", clientSecret: "secret" });
        await expect(getOauth).resolves.toEqual({ clientId: "client", clientSecret: "secret" });
    });

    it("resolves undefined when the host has no stored credentials", async () => {
        const { rpc, answerLast } = harness();
        const store = new RpcSecretStore(rpc);

        const getBasic = store.getBasicAuth();
        await answerLast(null);
        await expect(getBasic).resolves.toBeUndefined();

        const getOauth = store.getOAuth2();
        await answerLast(null);
        await expect(getOauth).resolves.toBeUndefined();
    });
});

describe("RpcTokenPrompt", () => {
    const PROMPT = {
        host: "github.com",
        title: "Personal Access Token for github.com",
        prompt: "why",
        password: true,
    } as const;

    it("sends the core's title and prompt and returns the answer as typed", async () => {
        const { frames, rpc, answerLast } = harness();

        const pending = new RpcTokenPrompt(rpc).promptForToken(PROMPT);
        expect(last(frames)).toEqual({
            id: expect.any(Number),
            method: "tokenPrompt/show",
            params: { title: "Personal Access Token for github.com", prompt: "why" },
        });
        await answerLast({ token: "  tok " });

        await expect(pending).resolves.toBe("  tok ");
    });
});

describe("RpcMarketplacePrompt", () => {
    const QUESTION = {
        title: "Add Template Marketplace",
        prompt: "Where",
        placeholder: "https://github.com/owner/repo",
        location: "acme",
        invalidLocation: "Enter a repository URL.",
        scopes: [],
        scope: "project",
    } as const;

    it("sends the add question without the check that runs only in-process, and returns the answer as entered", async () => {
        const { frames, rpc, answerLast } = harness();

        const pending = new RpcMarketplacePrompt(rpc).promptForMarketplace({
            ...QUESTION,
            problemWith: () => "never sent",
        });
        expect(last(frames)).toEqual({
            id: expect.any(Number),
            method: "marketplacePrompt/show",
            params: QUESTION,
        });
        await answerLast({ location: " ~/t ", scope: "project" });

        await expect(pending).resolves.toEqual({ location: " ~/t ", scope: "project" });
    });

    it("resolves undefined when the form is cancelled", async () => {
        const { rpc, answerLast } = harness();

        const pending = new RpcMarketplacePrompt(rpc).promptForMarketplace({
            ...QUESTION,
            problemWith: () => undefined,
        });
        await answerLast(null);

        await expect(pending).resolves.toBeUndefined();
    });
});

describe("RpcMarketplaceRegistrations", () => {
    it("reads the host's registrations and writes each change as an acknowledged request", async () => {
        const { frames, rpc, answerLast } = harness();
        const registrations = new RpcMarketplaceRegistrations(rpc);
        const held = { registered: { project: ["/work/t"], allProjects: [] }, writable: [] };

        const read = registrations.read();
        expect(last(frames)).toMatchObject({ method: "marketplaceState/read", params: {} });
        await answerLast(held);
        await expect(read).resolves.toEqual(held);

        const register = registrations.register("/work/t", "allProjects");
        expect(last(frames)).toMatchObject({
            method: "marketplaceState/save",
            params: { location: "/work/t", scope: "allProjects" },
        });
        await answerLast(null);
        await expect(register).resolves.toBeUndefined();

        const unregister = registrations.unregister(["/work/t"]);
        expect(last(frames)).toMatchObject({
            method: "marketplaceState/remove",
            params: { entries: ["/work/t"] },
        });
        await answerLast(null);
        await expect(unregister).resolves.toBeUndefined();
    });
});

describe("RpcClipboard", () => {
    it("reads via a clipboard/read request and resolves with the host's text", async () => {
        const { frames, rpc, answerLast } = harness();
        const clipboard = new RpcClipboard(rpc);

        const pending = clipboard.readClipboard();
        expect(last(frames)).toMatchObject({ method: "clipboard/read", params: {} });
        await answerLast({ text: "copied" });

        await expect(pending).resolves.toBe("copied");
    });

    it("resolves to an empty string when the host reports no clipboard text", async () => {
        const { rpc, answerLast } = harness();
        const clipboard = new RpcClipboard(rpc);

        const pending = clipboard.readClipboard();
        await answerLast({});

        await expect(pending).resolves.toBe("");
    });

    it("writes via a fire-and-forget clipboard/write notification", () => {
        const { frames, rpc } = harness();

        new RpcClipboard(rpc).writeClipboard("payload");

        expect(last(frames)).toEqual({ method: "clipboard/write", params: { text: "payload" } });
    });
});

describe("RpcStatusBar", () => {
    it("sends a slot's view to the host", () => {
        const { frames, rpc } = harness();
        const view = {
            text: "Camunda 7 (7.20)",
            icon: "engine",
            tooltip: "Click to change engine version",
            tone: "neutral",
            action: "changeEngineVersion",
        } as const;

        new RpcStatusBar(rpc).show("engineVersion", view);

        expect(last(frames)).toEqual({
            method: "statusBar/update",
            params: { slot: "engineVersion", view },
        });
    });

    it("hides a slot by sending no view", () => {
        const { frames, rpc } = harness();

        new RpcStatusBar(rpc).hide("bpmnlint");

        expect(last(frames)).toEqual({
            method: "statusBar/update",
            params: { slot: "bpmnlint", view: null },
        });
    });
});

describe("RpcPicker", () => {
    function setup() {
        const h = harness();
        return { ...h, picker: new RpcPicker(h.rpc) };
    }

    describe("generic prompts", () => {
        const statusActions: ChoicePrompt<string> = {
            id: "deploymentStatusAction",
            title: "Deployment",
            placeholder: 'Deployment target "dev"',
            items: [
                { label: "Switch deployment target…", icon: "swap", value: "switch" },
                {
                    label: "Verify on dev",
                    description: "Camunda 7",
                    icon: "cloud",
                    value: "verify",
                },
            ],
        };
        const files: ChoicePrompt<string> = {
            id: "deployableFiles",
            placeholder: "Select files",
            items: ["/w/a.form", "/w/b.dmn", "/w/c.json"].map((path) => ({
                label: posix.basename(path),
                description: "unused",
                path,
                value: path,
            })),
        };
        const matches = (paths: string[]): LocateResult => ({
            kind: "matches",
            paths,
            readFailures: [],
        });
        const locate = (search: () => Promise<LocateResult>): SearchPrompt<LocateResult> => ({
            id: "locate",
            searchingPlaceholder: "Searching…",
            search,
            choices: (outcome) =>
                outcome.kind === "matches" && outcome.paths.length > 1
                    ? {
                          id: "locatedFile",
                          placeholder: "Select the file to open",
                          items: outcome.paths.map((path) => ({
                              label: posix.basename(path),
                              path,
                              value: path,
                          })),
                      }
                    : undefined,
        });

        it("choose sends labels and descriptions without icons and returns the chosen value", async () => {
            const { frames, picker, answerLast } = setup();
            const pending = picker.choose(statusActions);

            expect(last(frames)).toMatchObject({
                method: "picker/show",
                params: {
                    title: "Deployment",
                    placeholder: 'Deployment target "dev"',
                    canPickMany: false,
                    items: [
                        { label: "Switch deployment target…" },
                        { label: "Verify on dev", description: "Camunda 7" },
                    ],
                },
            });
            expect(last(frames).params.items.flatMap(Object.keys)).toEqual([
                "label",
                "label",
                "description",
            ]);
            await answerLast({ selected: [1] });
            await expect(pending).resolves.toBe("verify");
        });

        it("choose rejects an index the prompt does not hold", async () => {
            const { frames, picker, answerLast } = setup();
            const pending = picker.choose(statusActions);
            expect(last(frames)?.method).toBe("picker/show");
            await answerLast({ selected: [2] });
            await expect(pending).rejects.toThrow(/index 2/);
        });

        it("chooseMany shows each file's path and maps the chosen indices to values", async () => {
            const { frames, picker, answerLast } = setup();
            const pending = picker.chooseMany(files);

            expect(last(frames)).toMatchObject({
                method: "picker/show",
                params: { placeholder: "Select files", canPickMany: true },
            });
            expect(last(frames).params.items).toEqual([
                { label: "a.form", description: "/w/a.form" },
                { label: "b.dmn", description: "/w/b.dmn" },
                { label: "c.json", description: "/w/c.json" },
            ]);
            await answerLast({ selected: [0, 2] });
            await expect(pending).resolves.toEqual(["/w/a.form", "/w/c.json"]);
        });

        it("confirm sends the details as given and is true only on confirmation", async () => {
            const { frames, picker, answerLast } = setup();
            const details = Array.from({ length: 14 }, (_, index) => `target-${index + 1}`);
            const request = {
                id: "deleteTarget",
                title: "Delete?",
                confirmLabel: "Delete",
                details,
            };

            const confirmed = picker.confirm(request);
            expect(last(frames)).toMatchObject({
                method: "confirm/show",
                params: { title: "Delete?", confirmLabel: "Delete", details },
            });
            await answerLast({ confirmed: true });
            await expect(confirmed).resolves.toBe(true);

            const declined = picker.confirm(request);
            await answerLast({ confirmed: false });
            await expect(declined).resolves.toBe(false);
        });

        it("confirm answers false when the host replies without a confirmation", async () => {
            const { frames, picker, answerLast } = setup();
            const pending = picker.confirm({
                id: "deleteTarget",
                title: "Delete?",
                confirmLabel: "Delete",
                details: ["dev"],
            });
            expect(last(frames)?.method).toBe("confirm/show");
            await answerLast(null);
            await expect(pending).resolves.toBe(false);
        });

        it("searchAndChoose brackets the search with progress, then asks for the choice it leaves", async () => {
            const { frames, picker, answerLast } = setup();
            const outcome = matches(["/w/b.bpmn", "/w/a.bpmn"]);
            const pending = picker.searchAndChoose(locate(async () => outcome));
            await settle();

            expect(frames.filter((f) => f.method.startsWith("notifier/progress"))).toEqual([
                { method: "notifier/progressStart", params: { title: "Searching…" } },
                { method: "notifier/progressEnd", params: { title: "Searching…" } },
            ]);
            expect(last(frames)).toMatchObject({
                method: "picker/show",
                params: {
                    placeholder: "Select the file to open",
                    items: [
                        { label: "b.bpmn", description: "/w/b.bpmn" },
                        { label: "a.bpmn", description: "/w/a.bpmn" },
                    ],
                },
            });
            await answerLast({ selected: [1] });
            await expect(pending).resolves.toEqual({ outcome, chosen: "/w/a.bpmn" });
        });

        it("searchAndChoose skips the picker when the outcome leaves no choice", async () => {
            const { frames, picker } = setup();

            const result = await picker.searchAndChoose(locate(async () => matches(["/w/a.bpmn"])));

            expect(result).toEqual({ outcome: matches(["/w/a.bpmn"]), chosen: undefined });
            expect(frames.map((f) => f.method)).toEqual([
                "notifier/progressStart",
                "notifier/progressEnd",
            ]);
        });

        it("searchAndChoose still ends the spinner when the search throws", async () => {
            const { frames, picker } = setup();

            await expect(
                picker.searchAndChoose(
                    locate(async () => {
                        throw new Error("scan failed");
                    }),
                ),
            ).rejects.toThrow("scan failed");
            expect(frames.map((f) => f.method)).toEqual([
                "notifier/progressStart",
                "notifier/progressEnd",
            ]);
        });
    });
});
