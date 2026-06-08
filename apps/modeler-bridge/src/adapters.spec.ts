import { describe, expect, it, vi } from "vitest";

import {
    DocumentMirror,
    RpcDocumentPort,
    RpcEditorHandle,
    RpcNotifier,
    RpcStatusBar,
    SessionMeta,
} from "./adapters";
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
        const handle = new RpcEditorHandle(META, new DocumentMirror(), new Rpc(() => {}));
        expect(handle.id).toBe(META.editorId);
        expect(handle.documentUriString()).toBe(META.uriString);
        expect(handle.documentPath()).toBe(META.path);
        expect(handle.documentFsPath()).toBe(META.fsPath);
        expect(handle.documentScheme()).toBe(META.scheme);
        expect(handle.isActive()).toBe(true);
    });

    it("postMessage forwards an editor/postMessage notification", async () => {
        const { frames, rpc } = harness();
        const handle = new RpcEditorHandle(META, new DocumentMirror(), rpc);

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
        const handle = new RpcEditorHandle(META, mirror, rpc);

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
        const handle = new RpcEditorHandle(META, new DocumentMirror(), rpc);

        const pending = handle.save();
        expect(last(frames)).toMatchObject({ method: "document/save" });
        await answerLast({ saved: true });

        await expect(pending).resolves.toBe(true);
    });

    it("receive fires the onDidReceiveMessage callback and the disposer detaches it", () => {
        const handle = new RpcEditorHandle(META, new DocumentMirror(), new Rpc(() => {}));
        const received: unknown[] = [];
        const sub = handle.onDidReceiveMessage((m) => received.push(m));

        handle.receive({ type: "GetBpmnFileCommand" } as never);
        sub.dispose();
        handle.receive({ type: "GetBpmnFileCommand" } as never);

        expect(received).toHaveLength(1);
    });

    it("dispose runs onDidDispose callbacks", () => {
        const handle = new RpcEditorHandle(META, new DocumentMirror(), new Rpc(() => {}));
        const onDispose = vi.fn();
        handle.onDidDispose(onDispose);

        handle.dispose();

        expect(onDispose).toHaveBeenCalledOnce();
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
