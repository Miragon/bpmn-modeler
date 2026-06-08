import { describe, expect, it, vi } from "vitest";

import { UserCancelledError } from "@miragon/bpmn-modeler-core";

import {
    DocumentMirror,
    RpcDocumentPort,
    RpcEditorHandle,
    RpcNotifier,
    RpcPicker,
    RpcStatusBar,
    SessionMeta,
} from "./adapters";
import { BridgeSettings } from "./nodeAdapters";
import { Rpc } from "./rpc";

const META: SessionMeta = {
    editorId: "file:///w/a.bpmn",
    uriString: "file:///w/a.bpmn",
    path: "/w/a.bpmn",
    fsPath: "/w/a.bpmn",
    scheme: "file",
    workspaceRoot: "/w",
};

/** Returns the last element (ES2021 target has no `Array.prototype.at`). */
function last<T>(items: T[]): T {
    return items[items.length - 1];
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
        expect(handle.isActive()).toBe(true);
    });

    it("postMessage forwards an editor/postMessage notification", async () => {
        const { frames, rpc } = harness();
        const handle = new RpcEditorHandle(META, new DocumentMirror(), rpc, new BridgeSettings());

        await handle.postMessage({ type: "BpmnFileQuery" } as never);

        expect(last(frames)).toEqual({
            method: "editor/postMessage",
            params: { editorId: META.editorId, message: { type: "BpmnFileQuery" } },
        });
    });

    it("writeContent requests document/write and updates the mirror", async () => {
        const { frames, rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "old");
        const handle = new RpcEditorHandle(META, mirror, rpc, new BridgeSettings());

        const pending = handle.writeContent("new");
        expect(last(frames)).toMatchObject({
            method: "document/write",
            params: { editorId: META.editorId, content: "new" },
        });
        await answerLast({ changed: true });

        await expect(pending).resolves.toBe(true);
        expect(mirror.content(META.editorId)).toBe("new");
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
        const sub = handle.onDidChangeSetting((event) =>
            seen.push(event.affectsConfiguration("miragon.bpmnModeler.language")),
        );

        settings.apply({ language: "de" });
        sub.dispose();
        settings.apply({ language: "fr" });

        expect(seen).toEqual([true]);
    });
});

describe("BridgeSettings", () => {
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

    it("fires affectsConfiguration only for the keys that actually changed", () => {
        const settings = new BridgeSettings();
        const events: ((section: string) => boolean)[] = [];
        settings.onDidChange((event) => events.push(event.affectsConfiguration));

        settings.apply({ language: "de", alignToOrigin: false }); // alignToOrigin already false

        expect(events).toHaveLength(1);
        expect(events[0]("miragon.bpmnModeler.language")).toBe(true);
        expect(events[0]("miragon.bpmnModeler.alignToOrigin")).toBe(false);
        expect(events[0]("miragon.bpmnModeler.configFolder")).toBe(false);
    });

    it("does not fire when the snapshot is unchanged", () => {
        const settings = new BridgeSettings();
        const listener = vi.fn();
        settings.onDidChange(listener);

        settings.apply({ language: "en" }); // matches the default

        expect(listener).not.toHaveBeenCalled();
    });
});

describe("RpcDocumentPort", () => {
    it("reads through the mirror and routes writes/saves over RPC", async () => {
        const { rpc, answerLast } = harness();
        const mirror = new DocumentMirror();
        mirror.register(META, "seed");
        const port = new RpcDocumentPort(rpc, mirror);

        expect(port.getContent(META.editorId)).toBe("seed");
        expect(port.getFilePath(META.editorId)).toBe(META.fsPath);

        const write = port.write(META.editorId, "next");
        await answerLast({ changed: true });
        await expect(write).resolves.toBe(true);
        expect(mirror.content(META.editorId)).toBe("next");

        const save = port.save(META.editorId);
        await answerLast({ saved: true });
        await expect(save).resolves.toBe(true);
    });
});

describe("RpcNotifier", () => {
    it("forwards each user-facing and diagnostic call to a host frame", () => {
        const { frames, rpc } = harness();
        const notifier = new RpcNotifier(rpc);

        notifier.showInfo("done");
        expect(last(frames)).toEqual({ method: "notifier/showInfo", params: { message: "done" } });

        notifier.showError("boom");
        expect(last(frames)).toEqual({
            method: "notifier/showError",
            params: { message: "boom" },
        });

        notifier.logWarning("careful");
        expect(last(frames)).toEqual({
            method: "notifier/log",
            params: { level: "warn", message: "careful" },
        });

        notifier.logError(new Error("bad"));
        expect(last(frames)).toEqual({
            method: "notifier/log",
            params: { level: "error", message: "bad" },
        });

        notifier.openLoggingConsole();
        expect(last(frames)).toEqual({ method: "notifier/openConsole", params: {} });
    });

    it("notifyError logs the detail then surfaces a paired balloon", () => {
        const { frames, rpc } = harness();
        new RpcNotifier(rpc).notifyError("While loading", new Error("kaput"));

        expect(frames).toEqual([
            { method: "notifier/log", params: { level: "error", message: "While loading: kaput" } },
            {
                method: "notifier/notifyError",
                params: { context: "While loading", message: "kaput" },
            },
        ]);
    });

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

describe("RpcStatusBar", () => {
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
});

describe("RpcPicker", () => {
    /** Lets a `findFiles`-then-`show` chain settle before the frame is asserted. */
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    function setup() {
        const h = harness();
        const finder = { findFiles: vi.fn() };
        return { ...h, finder, picker: new RpcPicker(h.rpc, finder) };
    }

    it("pickExecutionPlatform maps the chosen label to an engine", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.pickExecutionPlatform("Pick a platform", ["Camunda 7", "Camunda 8"]);
        expect(last(frames)).toMatchObject({
            method: "picker/show",
            params: {
                placeholder: "Pick a platform",
                canPickMany: false,
                items: [{ label: "Camunda 7" }, { label: "Camunda 8" }],
            },
        });
        await answerLast({ selected: [1] });
        await expect(pending).resolves.toBe("c8");
    });

    it("pickExecutionPlatform throws UserCancelledError on dismissal", async () => {
        const { picker, answerLast } = setup();
        const pending = picker.pickExecutionPlatform("Pick", ["Camunda 7"]);
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

    it("pickReferencedModel sorts by path and returns the chosen one", async () => {
        const { frames, picker, answerLast } = setup();
        const pending = picker.pickReferencedModel(["/w/b.bpmn", "/w/a.bpmn"]);
        expect(
            last(frames).params.items.map((item: { description: string }) => item.description),
        ).toEqual(["/w/a.bpmn", "/w/b.bpmn"]);
        await answerLast({ selected: [0] });
        await expect(pending).resolves.toBe("/w/a.bpmn");
    });

    it("pickReferencedModel returns undefined on dismissal", async () => {
        const { picker, answerLast } = setup();
        const pending = picker.pickReferencedModel(["/w/a.bpmn"]);
        await answerLast({ selected: null });
        await expect(pending).resolves.toBeUndefined();
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
        await flush();

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
        await flush();
        await answerLast({ selected: null });
        await expect(pending).resolves.toEqual([]);
    });
});
