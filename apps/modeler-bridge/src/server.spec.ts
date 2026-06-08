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

/** Frames the host would send to register an open `.bpmn` editor. */
function registerParams(
    editorId: string,
    root: string,
    fsPath: string,
    content: string,
    settings?: Record<string, unknown>,
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
                params: { editorId, message: { type: "SyncDocumentCommand", content: edited } },
            }),
        );
        await settle();

        // The write leg routes back to the host as a request it must answer.
        const write = frames.find((f) => f.method === "document/write" && f.id != null);
        expect(write).toBeDefined();
        expect(write.params.editorId).toBe(editorId);
        expect(write.params.content).toContain("Process_renamed");
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
        const before = frames.length;

        await rpc.handleLine(
            JSON.stringify({
                method: "settings/didChange",
                params: { settings: { configFolder: ".camunda-next" } },
            }),
        );
        await settle();
        await settle();

        const templates = frames
            .slice(before)
            .find(
                (f) =>
                    f.method === "editor/postMessage" &&
                    f.params.message.type === "ElementTemplatesQuery",
            );
        expect(templates).toBeDefined();
        expect(templates.params.message.elementTemplates).toContainEqual(
            expect.objectContaining({ name: "Next Template" }),
        );

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));
    });
});
