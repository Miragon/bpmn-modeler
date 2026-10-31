import { readFileSync } from "node:fs";
import { posix, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
    ChoicePrompt,
    DEFAULT_LINTING_ENABLED,
    DEFAULT_MODELER_SETTINGS,
    DeploymentStatePatch,
    LocateResult,
    SearchPrompt,
    SettingChange,
    UserCancelledError,
} from "@miragon/bpmn-modeler-core";
import {
    readSettingsSnapshot,
    settingsNormalizationCases,
    TYPESCRIPT_ONLY_SETTINGS_CASES,
} from "@miragon/bpmn-modeler-core/testing";

import { settle } from "./__fixtures__/bridgeHarness";
import {
    DocumentMirror,
    RpcClipboard,
    RpcDeploymentState,
    RpcDocumentPort,
    RpcEditorHandle,
    RpcNotifier,
    RpcPicker,
    RpcSecretStore,
    RpcStatusBar,
    SessionMeta,
} from "./adapters";
import { BridgeSettings } from "./nodeAdapters";
import { Rpc } from "./rpc";

const META: SessionMeta = {
    editorId: "file:///w/a.bpmn",
    sessionId: 9,
    uriString: "file:///w/a.bpmn",
    path: "/w/a.bpmn",
    fsPath: "/w/a.bpmn",
    scheme: "file",
    workspaceRoot: "/w",
};

const SHARED_SETTINGS_CASES = settingsNormalizationCases(
    readFileSync(
        resolve(
            __dirname,
            "../../../libs/modeler-core/src/kernel/domain/settingsNormalization.cases.json",
        ),
        "utf8",
    ),
);

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
    it("exposes the session identity from its metadata", () => {
        const handle = new RpcEditorHandle(
            META,
            new DocumentMirror(),
            new Rpc(() => {}),
            new BridgeSettings(),
        );
        expect(handle.id).toBe(META.editorId);
        expect(handle.documentUriString()).toBe(META.uriString);
        expect(handle.documentPath()).toBe(META.path);
        expect(handle.documentFsPath()).toBe(META.fsPath);
        expect(handle.documentScheme()).toBe(META.scheme);
    });

    it("reports focus changes the store drives through setActive", () => {
        const handle = new RpcEditorHandle(
            META,
            new DocumentMirror(),
            new Rpc(() => {}),
            new BridgeSettings(),
        );
        const focus: boolean[] = [];
        handle.onDidChangeActive((active) => focus.push(active));

        handle.setActive(true);
        handle.setActive(true);
        handle.setActive(false);

        expect(focus).toEqual([true, false]);
        expect(handle.isActive()).toBe(false);
    });

    it("reports mirrored content changes of its own document only", () => {
        const mirror = new DocumentMirror();
        const handle = new RpcEditorHandle(META, mirror, new Rpc(() => {}), new BridgeSettings());
        const changed: string[] = [];
        handle.onDidChangeDocument((event) => changed.push(event.documentUriString()));

        mirror.setContent(META.editorId, "<edited/>");
        mirror.setContent("file:///other.bpmn", "<other/>");

        expect(changed).toEqual([META.uriString]);
    });

    it("runs its dispose callbacks once", () => {
        const handle = new RpcEditorHandle(
            META,
            new DocumentMirror(),
            new Rpc(() => {}),
            new BridgeSettings(),
        );
        const disposed = vi.fn();
        handle.onDidDispose(disposed);

        handle.dispose();
        handle.dispose();

        expect(disposed).toHaveBeenCalledOnce();
    });

    it("postMessage forwards an editor/postMessage notification", async () => {
        const { frames, rpc } = harness();
        const handle = new RpcEditorHandle(META, new DocumentMirror(), rpc, new BridgeSettings());

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
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings());

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
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings());

        const pending = handle.writeContent("stale", 2);
        await answerLast({ changed: false, accepted: false });

        await expect(pending).resolves.toBe(false);
        expect(mirror.content(META.editorId)).toBe("host");
    });

    it("keeps authoritative mirror bytes after an accepted no-op write", async () => {
        const { rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "<xml/>\n");
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings());

        const pending = handle.writeContent("<xml/>\r\n", 0);
        await answerLast({ changed: false, accepted: true });

        await expect(pending).resolves.toBe(false);
        expect(mirror.content(META.editorId)).toBe("<xml/>\n");
    });

    it("does not let a late write response overwrite a replacement session", async () => {
        const { rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "old");
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings());

        const pending = handle.writeContent("stale", 0);
        mirror.remove(META.editorId);
        mirror.register({ ...META, sessionId: 10 }, "replacement");
        await answerLast({ changed: true, accepted: true });

        await expect(pending).resolves.toBe(true);
        expect(mirror.content(META.editorId)).toBe("replacement");
    });

    it("save requests document/save and returns the saved flag", async () => {
        const { frames, rpc, answerLast } = harness();
        const handle = new RpcEditorHandle(META, new DocumentMirror(), rpc, new BridgeSettings());

        const pending = handle.save();
        expect(last(frames)).toMatchObject({ method: "document/save" });
        await answerLast({ saved: true });

        await expect(pending).resolves.toBe(true);
    });

    it("receive fires the onDidReceiveMessage callback and the disposer detaches it", () => {
        const handle = new RpcEditorHandle(
            META,
            new DocumentMirror(),
            new Rpc(() => {}),
            new BridgeSettings(),
        );
        const received: unknown[] = [];
        const sub = handle.onDidReceiveMessage((m) => received.push(m));

        handle.receive({ type: "GetBpmnFileCommand" } as never);
        sub.dispose();
        handle.receive({ type: "GetBpmnFileCommand" } as never);

        expect(received).toHaveLength(1);
    });

    it("dispose runs onDidDispose callbacks", () => {
        const handle = new RpcEditorHandle(
            META,
            new DocumentMirror(),
            new Rpc(() => {}),
            new BridgeSettings(),
        );
        const onDispose = vi.fn();
        handle.onDidDispose(onDispose);

        handle.dispose();

        expect(onDispose).toHaveBeenCalledOnce();
    });

    it("onDidChangeSetting relays the shared settings hub and detaches on dispose", () => {
        const settings = new BridgeSettings();
        const handle = new RpcEditorHandle(META, new DocumentMirror(), new Rpc(() => {}), settings);
        const seen: boolean[] = [];
        const sub = handle.onDidChangeSetting((event) => seen.push(event.affects("language")));

        settings.apply({ language: "de" });
        sub.dispose();
        settings.apply({ language: "fr" });

        expect(seen).toEqual([true]);
    });
});

describe("BridgeSettings", () => {
    it("reads the shared defaults before the host's first snapshot", () => {
        const settings = new BridgeSettings();

        expect(readSettingsSnapshot(settings)).toEqual(DEFAULT_MODELER_SETTINGS);
        expect(settings.getLintingEnabled()).toBe(DEFAULT_LINTING_ENABLED);
    });

    it.each([...SHARED_SETTINGS_CASES, ...TYPESCRIPT_ONLY_SETTINGS_CASES])(
        "$name",
        ({ raw, normalized }) => {
            const settings = new BridgeSettings();

            settings.apply(raw);

            expect(readSettingsSnapshot(settings)).toEqual({
                ...DEFAULT_MODELER_SETTINGS,
                ...normalized,
            });
        },
    );

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

    it("exposes the host snapshot through the SettingsPort getters", () => {
        const settings = new BridgeSettings();
        settings.apply({
            alignToOrigin: true,
            configFolder: ".config",
            colorTheme: "light",
            favouriteBpmnElements: ["bpmn:Task"],
            language: "de",
        });

        expect(settings.getAlignToOrigin()).toBe(true);
        expect(settings.getConfigFolder()).toBe(".config");
        expect(settings.getColorTheme()).toBe("light");
        expect(settings.getFavouriteBpmnElements()).toEqual(["bpmn:Task"]);
        expect(settings.getLanguage()).toBe("de");
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

    it.each([
        { toggles: [true], changed: [false], changes: 0, enabled: true },
        { toggles: [false], changed: [true], changes: 1, enabled: false },
        { toggles: [false, false], changed: [true, false], changes: 1, enabled: false },
        { toggles: [false, true], changed: [true, true], changes: 2, enabled: true },
    ])(
        "reports the linting toggles $toggles as $changes linting.enabled change(s)",
        ({ toggles, changed, changes, enabled }) => {
            const settings = new BridgeSettings();
            const events: SettingChange[] = [];
            settings.onDidChange((event) => events.push(event));

            const results = toggles.map((toggle) => settings.setLintingEnabled(toggle));

            expect(results).toEqual(changed);
            expect(settings.getLintingEnabled()).toBe(enabled);
            expect(events).toHaveLength(changes);
            for (const event of events) {
                expect(event.affects("linting.enabled")).toBe(true);
                expect(event.affects("language")).toBe(false);
            }
        },
    );

    it("keeps the linting toggle when the host pushes a settings snapshot", () => {
        const settings = new BridgeSettings();
        settings.setLintingEnabled(false);

        settings.apply({ language: "de", configFolder: ".config" });

        expect(settings.getLintingEnabled()).toBe(false);
    });
});

describe("RpcDocumentPort", () => {
    it("reads through the mirror and routes writes/saves over RPC", async () => {
        const { frames, rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "seed");
        const port = new RpcDocumentPort(rpc, mirror);

        expect(port.getContent(META.editorId)).toBe("seed");
        expect(port.getFilePath(META.editorId)).toBe(META.fsPath);

        const write = port.write(META.editorId, "next", 3);
        expect(last(frames)).toMatchObject({
            params: {
                editorId: META.editorId,
                sessionId: META.sessionId,
                expectedDocumentRevision: 3,
            },
        });
        await answerLast({ changed: true });
        await expect(write).resolves.toBe(true);
        expect(mirror.content(META.editorId)).toBe("next");

        const save = port.save(META.editorId);
        await answerLast({ saved: true });
        await expect(save).resolves.toBe(true);
    });

    it("does not update the mirror when the host rejects a stale write", async () => {
        const { rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "host");
        const port = new RpcDocumentPort(rpc, mirror);

        const write = port.write(META.editorId, "stale", 1);
        await answerLast({ changed: false, accepted: false });

        await expect(write).resolves.toBe(false);
        expect(mirror.content(META.editorId)).toBe("host");
    });
});

describe("RpcDeploymentState", () => {
    const revision = { fingerprint: "f", deployedAt: "2026-09-17T14:32:00.000Z" };

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

    it("sends a save as one acknowledged request and applies it to the mirror optimistically", async () => {
        const { frames, rpc, answerLast } = harness();
        const state = new RpcDeploymentState(rpc);
        state.seed({
            ledger: {
                "target:dev@localhost:8080::/a.bpmn": revision,
                "target:prod@localhost:8080::/a.bpmn": revision,
            },
        });
        const patch: DeploymentStatePatch = {
            endpoint: "https://engine",
            authType: "oauth2",
            ledger: { remove: ["target:dev@localhost:8080::/a.bpmn"] },
        };

        const pending = state.save(patch);
        // The persist is a request (has an id), not a fire-and-forget notification.
        expect(last(frames)).toMatchObject({ method: "deploymentState/save", params: { patch } });
        expect(last(frames).id).toBeTypeOf("number");
        // Reads are correct before the host even acks (optimistic update).
        expect(state.load()).toMatchObject({
            endpoint: "https://engine",
            authType: "oauth2",
            ledger: { "target:prod@localhost:8080::/a.bpmn": revision },
        });
        expect(Object.keys(state.load().ledger)).toEqual(["target:prod@localhost:8080::/a.bpmn"]);

        await answerLast(null);
        await expect(pending).resolves.toBeUndefined();
    });

    it("rejects when the host fails to persist and keeps the optimistic mirror", async () => {
        const { frames, rpc } = harness();
        const state = new RpcDeploymentState(rpc);

        const pending = state.save({ endpoint: "https://engine", tenantId: "t1" });
        await rpc.handleLine(JSON.stringify({ id: last(frames).id, error: "disk full" }));

        await expect(pending).rejects.toThrow("disk full");
        // Rolling back would show stale form values mid-session; the next seed reconciles.
        expect(state.load().endpoint).toBe("https://engine");
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

    it("withProgress brackets the task and returns its result", async () => {
        const { frames, rpc } = harness();
        const result = await new RpcNotifier(rpc).withProgress("Work", async () => 42);

        expect(result).toBe(42);
        expect(frames.map((f) => f.method)).toEqual([
            "notifier/progressStart",
            "notifier/progressEnd",
        ]);
    });

    it("withProgress still ends the spinner when the task throws", async () => {
        const { frames, rpc } = harness();
        const run = new RpcNotifier(rpc).withProgress("Work", async () => {
            throw new Error("fail");
        });

        await expect(run).rejects.toThrow("fail");
        expect(frames.map((f) => f.method)).toEqual([
            "notifier/progressStart",
            "notifier/progressEnd",
        ]);
    });
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

    it("forwards template and engine-version updates as host frames", () => {
        const { frames, rpc } = harness();
        const statusBar = new RpcStatusBar(rpc);

        statusBar.showElementTemplatesLoading();
        expect(last(frames)).toEqual({ method: "statusBar/templatesLoading", params: {} });

        statusBar.showElementTemplatesReady(12);
        expect(last(frames)).toEqual({
            method: "statusBar/templatesReady",
            params: { count: 12 },
        });

        statusBar.showEngineVersion("c7", "7.20.0");
        expect(last(frames)).toEqual({
            method: "statusBar/showEngineVersion",
            params: { platform: "c7", version: "7.20.0" },
        });

        statusBar.hideEngineVersion();
        expect(last(frames)).toEqual({ method: "statusBar/hideEngineVersion", params: {} });
    });

    it("forwards the deployment target with verifiedAt, nulling absent values", () => {
        const { frames, rpc } = harness();
        const statusBar = new RpcStatusBar(rpc);

        statusBar.showDeploymentTarget(
            "dev",
            "superseded",
            "2026-09-17T14:40:00.000Z",
            "2026-09-17T15:00:00.000Z",
        );
        expect(last(frames)).toEqual({
            method: "statusBar/showDeploymentTarget",
            params: {
                name: "dev",
                freshness: "superseded",
                deployedAt: "2026-09-17T14:40:00.000Z",
                verifiedAt: "2026-09-17T15:00:00.000Z",
            },
        });

        statusBar.showDeploymentTarget(undefined, "unknown");
        expect(last(frames)).toEqual({
            method: "statusBar/showDeploymentTarget",
            params: { name: null, freshness: "unknown", deployedAt: null, verifiedAt: null },
        });
    });
});

describe("RpcPicker", () => {
    function setup() {
        const h = harness();
        const finder = { findFiles: vi.fn() };
        return { ...h, finder, picker: new RpcPicker(h.rpc, finder) };
    }

    it("pickNewModelEngine lists the engines plus the neutral choice and returns the id", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.pickNewModelEngine("Pick a platform");
        expect(last(frames)).toMatchObject({
            method: "picker/show",
            params: {
                placeholder: "Pick a platform",
                canPickMany: false,
                items: [
                    { label: "Camunda 7" },
                    { label: "Camunda 8" },
                    {
                        label: "Engine-neutral",
                        description: "No execution platform — opens in Design mode",
                    },
                ],
            },
        });
        await answerLast({ selected: [2] });
        await expect(pending).resolves.toBe("neutral");
    });

    it("pickNewModelEngine throws UserCancelledError on dismissal", async () => {
        const { picker, answerLast } = setup();
        const pending = picker.pickNewModelEngine("Pick");
        await answerLast({ selected: null });
        await expect(pending).rejects.toBeInstanceOf(UserCancelledError);
    });

    it("pickMigrationScope labels the counts and maps the selection", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.pickMigrationScope(1, 3);
        expect(last(frames).params.items.map((item: { label: string }) => item.label)).toEqual([
            "Camunda 7 only (1 diagram)",
            "Camunda 8 only (3 diagrams)",
            "Both (4 diagrams)",
        ]);
        await answerLast({ selected: [2] });
        await expect(pending).resolves.toBe("both");
    });

    it("pickMigrationScope throws on dismissal", async () => {
        const { picker, answerLast } = setup();
        const pending = picker.pickMigrationScope(2, 2);
        await answerLast({ selected: null });
        await expect(pending).rejects.toBeInstanceOf(UserCancelledError);
    });

    it("pickEngineVersion returns the chosen version", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.pickEngineVersion("c7", ["7.19", "7.20"]);
        expect(last(frames)).toMatchObject({
            method: "picker/show",
            params: { placeholder: "Select Camunda 7 engine version", canPickMany: false },
        });
        await answerLast({ selected: [1] });
        await expect(pending).resolves.toBe("7.20");
    });

    it("pickEngineVersion throws on dismissal", async () => {
        const { picker, answerLast } = setup();
        const pending = picker.pickEngineVersion("c8", ["8.5"]);
        await answerLast({ selected: null });
        await expect(pending).rejects.toBeInstanceOf(UserCancelledError);
    });

    it("pickPayloadFile returns the chosen path with a basename label", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.pickPayloadFile(["/w/a.json", "/w/sub/b.json"]);
        expect(last(frames).params.items).toEqual([
            { label: "a.json", description: "/w/a.json" },
            { label: "b.json", description: "/w/sub/b.json" },
        ]);
        await answerLast({ selected: [1] });
        await expect(pending).resolves.toEqual({ filePath: "/w/sub/b.json", label: "b.json" });
    });

    it("pickPayloadFile returns null on dismissal", async () => {
        const { picker, answerLast } = setup();
        const pending = picker.pickPayloadFile(["/w/a.json"]);
        await answerLast({ selected: null });
        await expect(pending).resolves.toBeNull();
    });

    it("pickDeploymentStatusAction offers verify only for a C7 target and maps the index", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.pickDeploymentStatusAction({ targetName: "dev", canVerify: true });
        expect(last(frames)).toMatchObject({
            method: "picker/show",
            params: {
                placeholder: 'Deployment target "dev"',
                canPickMany: false,
                items: [{ label: "Switch deployment target…" }, { label: "Verify on dev" }],
            },
        });
        await answerLast({ selected: [1] });
        await expect(pending).resolves.toBe("verify");
    });

    it("pickDeploymentStatusAction hides verify when the target cannot be verified", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.pickDeploymentStatusAction({ canVerify: false });
        expect(last(frames).params.items).toEqual([{ label: "Switch deployment target…" }]);
        await answerLast({ selected: [0] });
        await expect(pending).resolves.toBe("switch");
    });

    it("pickDeploymentStatusAction resolves undefined on dismissal", async () => {
        const { picker, answerLast } = setup();
        const pending = picker.pickDeploymentStatusAction({ targetName: "dev", canVerify: true });
        await answerLast({ selected: null });
        await expect(pending).resolves.toBeUndefined();
    });

    it("searchAndPickLocatedFile brackets the search with progress, then picks from multiple matches", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.searchAndPickLocatedFile(
            { searchingPlaceholder: "Searching…", pickPlaceholder: "Select the file to open" },
            async () => ({
                kind: "matches",
                paths: ["/w/b.bpmn", "/w/a.bpmn"],
                readFailures: [],
            }),
        );
        await settle();

        // No busy list on the host, so the search keeps the status-bar spinner:
        // progress brackets it, then the picker opens.
        expect(frames.filter((f) => f.method.startsWith("notifier/progress"))).toEqual([
            { method: "notifier/progressStart", params: { title: "Searching…" } },
            { method: "notifier/progressEnd", params: { title: "Searching…" } },
        ]);
        const show = frames.find((f) => f.method === "picker/show");
        expect(show.params.placeholder).toBe("Select the file to open");
        expect(show.params.items.map((item: { description: string }) => item.description)).toEqual([
            "/w/a.bpmn",
            "/w/b.bpmn",
        ]);
        await answerLast({ selected: [0] });
        await expect(pending).resolves.toEqual({
            outcome: { kind: "matches", paths: ["/w/b.bpmn", "/w/a.bpmn"], readFailures: [] },
            chosen: "/w/a.bpmn",
        });
    });

    it("searchAndPickLocatedFile skips the picker for a single match", async () => {
        const { frames, picker } = setup();
        const result = await picker.searchAndPickLocatedFile(
            { searchingPlaceholder: "Searching…", pickPlaceholder: "Select the file to open" },
            async () => ({
                kind: "matches",
                paths: ["/w/only.bpmn"],
                readFailures: [],
            }),
        );
        expect(result).toEqual({
            outcome: { kind: "matches", paths: ["/w/only.bpmn"], readFailures: [] },
            chosen: undefined,
        });
        expect(frames.find((f) => f.method === "picker/show")).toBeUndefined();
        expect(frames.map((f) => f.method)).toEqual([
            "notifier/progressStart",
            "notifier/progressEnd",
        ]);
    });

    it("searchAndPickLocatedFile returns chosen=undefined when the list is dismissed", async () => {
        const { picker, answerLast } = setup();
        const pending = picker.searchAndPickLocatedFile(
            { searchingPlaceholder: "Searching…", pickPlaceholder: "Select the file to open" },
            async () => ({
                kind: "matches",
                paths: ["/w/a.bpmn", "/w/b.bpmn"],
                readFailures: [],
            }),
        );
        await settle();
        await answerLast({ selected: null });
        await expect(pending).resolves.toEqual({
            outcome: { kind: "matches", paths: ["/w/a.bpmn", "/w/b.bpmn"], readFailures: [] },
            chosen: undefined,
        });
    });

    it("searchAndPickLocatedFile still ends the spinner when the search throws", async () => {
        const { frames, picker } = setup();
        const run = picker.searchAndPickLocatedFile(
            { searchingPlaceholder: "Searching…", pickPlaceholder: "Select the file to open" },
            async () => {
                throw new Error("scan failed");
            },
        );
        await expect(run).rejects.toThrow("scan failed");
        expect(frames.map((f) => f.method)).toEqual([
            "notifier/progressStart",
            "notifier/progressEnd",
        ]);
    });

    it("pickScriptLanguage pins the current format first and returns it", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.pickScriptLanguage("groovy");
        expect(last(frames).params.title).toBe("Script Language");
        expect(last(frames).params.items[0]).toEqual({ label: "Groovy", description: ".groovy" });
        await answerLast({ selected: [0] });
        await expect(pending).resolves.toBe("groovy");
    });

    it("pickScriptLanguage returns undefined on dismissal", async () => {
        const { picker, answerLast } = setup();
        const pending = picker.pickScriptLanguage("javascript");
        await answerLast({ selected: null });
        await expect(pending).resolves.toBeUndefined();
    });

    it("pickWorkspaceFiles globs then maps the multi-selection", async () => {
        const { frames, picker, answerLast, finder } = setup();
        finder.findFiles.mockResolvedValue(["/w/a.form", "/w/b.json", "/w/c.dmn"]);
        const pending = picker.pickWorkspaceFiles({
            glob: "**/*.{form,json,dmn}",
            exclude: "**/element-templates/**",
            placeholder: "Pick files",
        });
        await settle();

        expect(finder.findFiles).toHaveBeenCalledWith(
            "**/*.{form,json,dmn}",
            "**/element-templates/**",
            undefined,
        );
        expect(last(frames)).toMatchObject({
            method: "picker/show",
            params: { canPickMany: true, placeholder: "Pick files" },
        });
        await answerLast({ selected: [0, 2] });
        await expect(pending).resolves.toEqual(["/w/a.form", "/w/c.dmn"]);
    });

    it("pickWorkspaceFiles returns [] on dismissal", async () => {
        const { picker, answerLast, finder } = setup();
        finder.findFiles.mockResolvedValue(["/w/a.form"]);
        const pending = picker.pickWorkspaceFiles({ glob: "**/*.form", placeholder: "Pick" });
        await settle();
        await answerLast({ selected: null });
        await expect(pending).resolves.toEqual([]);
    });

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

        it("choose resolves undefined on dismissal", async () => {
            const { frames, picker, answerLast } = setup();
            const pending = picker.choose(statusActions);
            expect(last(frames)?.method).toBe("picker/show");
            await answerLast({ selected: null });
            await expect(pending).resolves.toBeUndefined();
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

        it("chooseMany resolves [] on dismissal", async () => {
            const { frames, picker, answerLast } = setup();
            const pending = picker.chooseMany(files);
            expect(last(frames)?.method).toBe("picker/show");
            await answerLast({ selected: null });
            await expect(pending).resolves.toEqual([]);
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

        it("searchAndChoose returns chosen=undefined when the list is dismissed", async () => {
            const { frames, picker, answerLast } = setup();
            const pending = picker.searchAndChoose(
                locate(async () => matches(["/w/a.bpmn", "/w/b.bpmn"])),
            );
            await settle();
            expect(last(frames)?.method).toBe("picker/show");
            await answerLast({ selected: null });
            await expect(pending).resolves.toMatchObject({ chosen: undefined });
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
