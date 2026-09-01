import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

/** A non-empty Camunda-7 diagram: detectable platform + version, so `display` posts without prompting. */
const C7_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.20.0">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

/** Spins past pending microtasks/timers so the router's async dispatch settles. */
async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Polls captured frames until `predicate` matches, instead of guessing a fixed
 * number of `settle()` ticks. A filesystem-backed reload (e.g. re-reading the
 * element-template folder on a configFolder change) takes an unbounded number of
 * event-loop turns under load, so a fixed wait races and flakes; polling waits
 * exactly as long as needed and fails fast with a clear message otherwise.
 */
async function waitForFrame(
    frames: any[],
    predicate: (frame: any) => boolean,
    timeoutMs = 5000,
): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const match = frames.find(predicate);
        if (match) return match;
        if (Date.now() >= deadline) {
            throw new Error("Timed out waiting for a matching frame");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/** Frames the host would send to register an open `.bpmn` editor. */
function registerParams(
    editorId: string,
    root: string,
    fsPath: string,
    content: string,
    settings?: Record<string, unknown>,
    session?: { sessionId: number; documentRevision: number },
) {
    return {
        editorId,
        uriString: editorId,
        path: editorId.replace(/^file:\/\//, ""),
        fsPath,
        scheme: "file",
        workspaceRoot: root,
        content,
        ...(settings ? { settings } : {}),
        ...session,
    };
}

describe("bridge end-to-end (real core over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    /** Builds a bridge whose emitted frames are captured, over a fresh temp workspace. */
    async function setup(): Promise<{ rpc: Rpc; frames: any[]; root: string; bpmnPath: string }> {
        const root = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-"));
        const bpmnPath = join(root, "process.bpmn");
        await fs.writeFile(bpmnPath, C7_XML, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge((line) => frames.push(JSON.parse(line)));

        cleanups.push(() => fs.rm(root, { recursive: true, force: true }));
        return { rpc, frames, root, bpmnPath };
    }

    it("registers a session and renders on GetBpmnFileCommand", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, bpmnPath, C7_XML),
            }),
        );
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: { editorId, message: { type: "GetBpmnFileCommand" } },
            }),
        );
        await settle();

        // The render leg: GetBpmnFileCommand → core display() → editor/postMessage(BpmnFileQuery).
        const render = frames.find(
            (f) => f.method === "editor/postMessage" && f.params.message.type === "BpmnFileQuery",
        );
        expect(render).toBeDefined();
        expect(render.params.editorId).toBe(editorId);
        expect(render.params.message.engine).toBe("c7");

        // The status-bar leg: the version is *really* parsed from the XML, not hard-coded.
        const engine = frames.find((f) => f.method === "statusBar/showEngineVersion");
        expect(engine?.params).toEqual({ platform: "c7", version: "7.20.0" });

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));
    });

    it("preserves the host session and document revision across render traffic", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, bpmnPath, C7_XML, undefined, {
                    sessionId: 17,
                    documentRevision: 4,
                }),
            }),
        );
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    sessionId: 17,
                    message: { type: "GetBpmnFileCommand" },
                },
            }),
        );
        await settle();

        const render = frames.find(
            (frame) =>
                frame.method === "editor/postMessage" &&
                frame.params.message.type === "BpmnFileQuery",
        );
        expect(render.params.sessionId).toBe(17);
        expect(render.params.message.documentRevision).toBe(4);
    });

    it("does not let an older didChange replace the authoritative mirror", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, bpmnPath, C7_XML, undefined, {
                    sessionId: 17,
                    documentRevision: 4,
                }),
            }),
        );
        frames.length = 0;
        await rpc.handleLine(
            JSON.stringify({
                method: "document/didChange",
                params: {
                    editorId,
                    sessionId: 17,
                    content: C7_XML.replace("Process_1", "Process_stale"),
                    documentRevision: 3,
                },
            }),
        );
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    sessionId: 17,
                    message: { type: "GetBpmnFileCommand" },
                },
            }),
        );
        await settle();

        const render = frames.find(
            (frame) =>
                frame.method === "editor/postMessage" &&
                frame.params.message.type === "BpmnFileQuery",
        );
        expect(render.params.message.content).toBe(C7_XML);
        expect(render.params.message.documentRevision).toBe(4);
    });

    it("ignores stale same-uri traffic and disposal after replacement", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;
        const register = (sessionId: number) =>
            rpc.handleLine(
                JSON.stringify({
                    method: "session/register",
                    params: registerParams(editorId, root, bpmnPath, C7_XML, undefined, {
                        sessionId,
                        documentRevision: 0,
                    }),
                }),
            );
        await register(1);
        await register(2);
        frames.length = 0;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/dispose",
                params: { editorId, sessionId: 1 },
            }),
        );
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    sessionId: 1,
                    message: { type: "GetBpmnFileCommand" },
                },
            }),
        );
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    sessionId: 2,
                    message: { type: "GetBpmnFileCommand" },
                },
            }),
        );
        await settle();

        const renders = frames.filter(
            (frame) =>
                frame.method === "editor/postMessage" &&
                frame.params.message.type === "BpmnFileQuery",
        );
        expect(renders).toHaveLength(1);
        expect(renders[0].params.sessionId).toBe(2);
    });

    it("routes messages to the correct editor when several are open at once", async () => {
        const { rpc, frames, root } = await setup();
        const a = join(root, "a.bpmn");
        const b = join(root, "b.bpmn");
        await fs.writeFile(a, C7_XML, "utf8");
        await fs.writeFile(b, C7_XML, "utf8");
        const idA = `file://${a}`;
        const idB = `file://${b}`;

        for (const [id, path] of [
            [idA, a],
            [idB, b],
        ] as const) {
            await rpc.handleLine(
                JSON.stringify({
                    method: "session/register",
                    params: registerParams(id, root, path, C7_XML),
                }),
            );
            await rpc.handleLine(
                JSON.stringify({
                    method: "webview/message",
                    params: { editorId: id, message: { type: "GetBpmnFileCommand" } },
                }),
            );
        }
        await settle();

        const rendersFor = (id: string) =>
            frames.filter(
                (f) =>
                    f.method === "editor/postMessage" &&
                    f.params.message.type === "BpmnFileQuery" &&
                    f.params.editorId === id,
            );
        expect(rendersFor(idA)).toHaveLength(1);
        expect(rendersFor(idB)).toHaveLength(1);

        await rpc.handleLine(
            JSON.stringify({ method: "session/dispose", params: { editorId: idA } }),
        );
        await rpc.handleLine(
            JSON.stringify({ method: "session/dispose", params: { editorId: idB } }),
        );
    });

    it("issues a document/write request when the webview syncs the document", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;
        const writeResponder = vi.fn();

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, bpmnPath, C7_XML),
            }),
        );

        const edited = C7_XML.replace("Process_1", "Process_renamed");
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: {
                        type: "SyncDocumentCommand",
                        content: edited,
                        documentRevision: 0,
                    },
                },
            }),
        );
        await settle();

        // The write leg routes back to the host as a request it must answer.
        const write = frames.find((f) => f.method === "document/write" && f.id != null);
        expect(write).toBeDefined();
        expect(write.params.editorId).toBe(editorId);
        expect(write.params.content).toContain("Process_renamed");
        expect(write.params.expectedDocumentRevision).toBe(0);
        writeResponder();

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));
        expect(writeResponder).toHaveBeenCalled();
    });

    it("seeds host-pushed settings so GetBpmnModelerSettingCommand reflects them", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, bpmnPath, C7_XML, {
                    alignToOrigin: true,
                    colorTheme: "light",
                    favouriteBpmnElements: ["bpmn:UserTask"],
                    language: "de",
                }),
            }),
        );
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: { editorId, message: { type: "GetBpmnModelerSettingCommand" } },
            }),
        );
        await settle();

        const setting = frames.find(
            (f) =>
                f.method === "editor/postMessage" &&
                f.params.message.type === "BpmnModelerSettingQuery",
        );
        expect(setting?.params.message.setting).toMatchObject({
            alignToOrigin: true,
            colorTheme: "light",
            favouriteBpmnElements: ["bpmn:UserTask"],
        });
        const language = frames.find(
            (f) => f.method === "editor/postMessage" && f.params.message.type === "LanguageQuery",
        );
        expect(language?.params.message.locale).toBe("de");

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));
    });

    it("re-pushes the language to a live editor on settings/didChange", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, bpmnPath, C7_XML, { language: "en" }),
            }),
        );
        const before = frames.length;

        await rpc.handleLine(
            JSON.stringify({
                method: "settings/didChange",
                params: { settings: { language: "fr" } },
            }),
        );
        await settle();

        const language = frames
            .slice(before)
            .find(
                (f) =>
                    f.method === "editor/postMessage" && f.params.message.type === "LanguageQuery",
            );
        expect(language?.params.message.locale).toBe("fr");

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));
    });

    it("reloads element templates from the new folder on a configFolder change", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;

        // A template only discoverable under the *new* config folder, proving the
        // reload re-reads the freshly configured directory rather than a cache.
        const templateDir = join(root, ".camunda-next", "element-templates");
        await fs.mkdir(templateDir, { recursive: true });
        await fs.writeFile(
            join(templateDir, "t.json"),
            JSON.stringify([{ name: "Next Template", id: "next", appliesTo: ["bpmn:Task"] }]),
            "utf8",
        );

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, bpmnPath, C7_XML, {
                    configFolder: ".camunda",
                }),
            }),
        );
        await rpc.handleLine(
            JSON.stringify({
                method: "settings/didChange",
                params: { settings: { configFolder: ".camunda-next" } },
            }),
        );

        // Only the post-change reload reads `.camunda-next`, so the "Next Template"
        // payload uniquely identifies the frame we are waiting for — no need to
        // slice by index or guess the settling time.
        const templates = await waitForFrame(
            frames,
            (f) =>
                f.method === "editor/postMessage" &&
                f.params.message.type === "ElementTemplatesQuery" &&
                f.params.message.elementTemplates?.some(
                    (t: { name?: string }) => t?.name === "Next Template",
                ),
        );
        expect(templates.params.message.elementTemplates).toContainEqual(
            expect.objectContaining({ name: "Next Template" }),
        );

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));
    });

    /** Counts the render frames (BpmnFileQuery) emitted for a given editor so far. */
    function renders(frames: any[], editorId: string): any[] {
        return frames.filter(
            (f) =>
                f.method === "editor/postMessage" &&
                f.params.message.type === "BpmnFileQuery" &&
                f.params.editorId === editorId,
        );
    }

    /** Registers an editor and drives the initial GetBpmnFileCommand render. */
    async function open(rpc: Rpc, editorId: string, root: string, fsPath: string): Promise<void> {
        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, fsPath, C7_XML),
            }),
        );
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: { editorId, message: { type: "GetBpmnFileCommand" } },
            }),
        );
        await settle();
    }

    it("re-renders the diagram on an external document/didChange", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;
        await open(rpc, editorId, root, bpmnPath);
        const before = renders(frames, editorId).length;

        // A genuine external edit (git revert, the plain-text tab) carries content
        // the bridge has never seen, so it must be pushed back to the webview.
        const external = C7_XML.replace("Process_1", "Process_externally_edited");
        await rpc.handleLine(
            JSON.stringify({
                method: "document/didChange",
                params: { editorId, content: external },
            }),
        );
        await settle();

        const after = renders(frames, editorId);
        expect(after).toHaveLength(before + 1);
        expect(after[after.length - 1].params.message.content).toContain(
            "Process_externally_edited",
        );

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));
    });

    it("suppresses the echo of its own write — no re-render loop", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;
        await open(rpc, editorId, root, bpmnPath);
        const before = renders(frames, editorId).length;

        // The webview edits the diagram → the core writes it back to the host…
        const edited = C7_XML.replace("Process_1", "Process_synced").replace(/\n/g, "\r\n");
        const hostContent = `${edited.replace(/\r\n/g, "\n")}\n`;
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: { editorId, message: { type: "SyncDocumentCommand", content: edited } },
            }),
        );
        await settle();
        const write = frames.find((f) => f.method === "document/write");
        expect(write).toBeDefined();
        // The write carries the per-editor revision the host must echo back.
        expect(write.params.revision).toBeTypeOf("number");

        // …and the host echoes that change back, stamped with the write's
        // revision as `causedBy`. Re-rendering it would loop; the bridge drops it
        // by explicit causation, not by comparing content.
        await rpc.handleLine(
            JSON.stringify({
                method: "document/didChange",
                params: { editorId, content: hostContent, causedBy: write.params.revision },
            }),
        );
        await settle();

        expect(renders(frames, editorId)).toHaveLength(before);

        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: { editorId, message: { type: "GetBpmnFileCommand" } },
            }),
        );
        await settle();
        const currentRenders = renders(frames, editorId);
        expect(currentRenders[currentRenders.length - 1].params.message.content).toBe(hostContent);

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));
    });

    it("re-renders on a document/didChange carrying a stale/unknown causedBy", async () => {
        const { rpc, frames, root, bpmnPath } = await setup();
        const editorId = `file://${bpmnPath}`;
        await open(rpc, editorId, root, bpmnPath);
        const before = renders(frames, editorId).length;

        // A `causedBy` the bridge never minted (e.g. a revision already consumed,
        // or one from a different host quirk) must not be mistaken for an echo —
        // the change still renders.
        const external = C7_XML.replace("Process_1", "Process_stale_cause");
        await rpc.handleLine(
            JSON.stringify({
                method: "document/didChange",
                params: { editorId, content: external, causedBy: 9999 },
            }),
        );
        await settle();

        const after = renders(frames, editorId);
        expect(after).toHaveLength(before + 1);
        expect(after[after.length - 1].params.message.content).toContain("Process_stale_cause");

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));
    });

    it("tracks the active editor without disturbing per-editor routing", async () => {
        const { rpc, frames, root } = await setup();
        const a = join(root, "a.bpmn");
        const b = join(root, "b.bpmn");
        await fs.writeFile(a, C7_XML, "utf8");
        await fs.writeFile(b, C7_XML, "utf8");
        const idA = `file://${a}`;
        const idB = `file://${b}`;
        await open(rpc, idA, root, a);
        await open(rpc, idB, root, b);

        // Focus moves back to A. The frame must be accepted, and an external edit
        // to A still re-renders A specifically — active tracking is orthogonal to
        // which editor a document change addresses.
        await rpc.handleLine(
            JSON.stringify({ method: "session/setActive", params: { editorId: idA } }),
        );
        const before = renders(frames, idA).length;
        await rpc.handleLine(
            JSON.stringify({
                method: "document/didChange",
                params: { editorId: idA, content: C7_XML.replace("Process_1", "Process_a_edited") },
            }),
        );
        await settle();

        expect(renders(frames, idA)).toHaveLength(before + 1);

        await rpc.handleLine(
            JSON.stringify({ method: "session/dispose", params: { editorId: idA } }),
        );
        await rpc.handleLine(
            JSON.stringify({ method: "session/dispose", params: { editorId: idB } }),
        );
    });
});
