/**
 * End-to-end coverage for the "Edit Script" RPC path on the bridge.
 *
 * Same harness style as `bridge.navigate.spec.ts`: the real bridge
 * (`createBridge`) runs against a fake transport (a frames array) over a real
 * temp filesystem, with a single registered editor session. The tests exercise
 * the four branches the script flow exposes to the host: open with a supported
 * format (no prompt), open with an unsupported format (picker round-trip +
 * format write-back), an inbound host edit routed back to the webview, and the
 * BPMN editor's disposal closing its open script tabs.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

const C7_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Polls `frames` for a match, mirroring the navigation spec's deterministic wait. */
async function waitForFrame(
    frames: any[],
    predicate: (frame: any) => boolean,
    timeoutMs = 2000,
): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const match = frames.find(predicate);
        if (match) return match;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("waitForFrame timed out");
}

function registerParams(editorId: string, root: string, fsPath: string, content: string) {
    return {
        editorId,
        uriString: editorId,
        path: editorId.replace(/^file:\/\//, ""),
        fsPath,
        scheme: "file",
        workspaceRoot: root,
        content,
    };
}

interface OpenCommand {
    elementId: string;
    kind: string;
    listenerIndex: number | undefined;
    eventName: string | undefined;
    scriptFormat: string;
    content: string;
}

describe("bridge script editor (real core over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    async function setup(): Promise<{ rpc: Rpc; frames: any[]; editorId: string }> {
        const root = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-script-"));
        const sourcePath = join(root, "source.bpmn");
        await fs.writeFile(sourcePath, C7_XML, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge((line) => frames.push(JSON.parse(line)));
        const editorId = `file://${sourcePath}`;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, sourcePath, C7_XML),
            }),
        );

        cleanups.push(() => fs.rm(root, { recursive: true, force: true }));
        return { rpc, frames, editorId };
    }

    async function feedOpen(rpc: Rpc, editorId: string, cmd: OpenCommand): Promise<void> {
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: { type: "OpenScriptEditorCommand", ...cmd },
                },
            }),
        );
        await settle();
    }

    it("opens directly with a script/open frame when the format is supported", async () => {
        const { rpc, frames, editorId } = await setup();

        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "x = 1",
        });

        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        expect(open.params.fileName).toBe("Task_1.groovy");
        expect(open.params.languageId).toBe("groovy");
        expect(open.params.content).toBe("x = 1");
        expect(typeof open.params.scriptId).toBe("string");
        // A supported format must not prompt.
        expect(frames.find((f) => f.method === "picker/show")).toBeUndefined();
    });

    it("prompts via picker/show for an unsupported format, then writes back the choice", async () => {
        const { rpc, frames, editorId } = await setup();

        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "",
            content: "",
        });

        const picker = await waitForFrame(
            frames,
            (f) => f.method === "picker/show" && f.id != null,
        );
        expect(picker.params.title).toBe("Script Language");
        // Reply with the first item; with an empty current format the order is
        // the canonical supportedFormats() order, so index 0 is "javascript".
        await rpc.handleLine(JSON.stringify({ id: picker.id, result: { selected: [0] } }));

        // The pick is persisted back to the model before the editor opens.
        const format = await waitForFrame(
            frames,
            (f) =>
                f.method === "editor/postMessage" &&
                f.params.message.type === "UpdateScriptFormatQuery",
        );
        expect(format.params.message.elementId).toBe("Task_1");
        expect(format.params.message.scriptFormat).toBe("javascript");

        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        expect(open.params.fileName).toBe("Task_1.js");
        expect(open.params.languageId).toBe("javascript");
    });

    it("routes an inbound script/didChange back to the webview as UpdateScriptContentQuery", async () => {
        const { rpc, frames, editorId } = await setup();

        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "execution-listener",
            listenerIndex: 0,
            eventName: "start",
            scriptFormat: "javascript",
            content: "",
        });
        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        const scriptId = open.params.scriptId;

        await rpc.handleLine(
            JSON.stringify({
                method: "script/didChange",
                params: { scriptId, content: "console.log('hi')" },
            }),
        );

        const update = await waitForFrame(
            frames,
            (f) =>
                f.method === "editor/postMessage" &&
                f.params.message.type === "UpdateScriptContentQuery",
        );
        expect(update.params.editorId).toBe(editorId);
        expect(update.params.message.elementId).toBe("Task_1");
        expect(update.params.message.kind).toBe("execution-listener");
        expect(update.params.message.listenerIndex).toBe(0);
        expect(update.params.message.content).toBe("console.log('hi')");
    });

    it("closes the editor's open script tabs on session/dispose", async () => {
        const { rpc, frames, editorId } = await setup();

        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "javascript",
            content: "",
        });
        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        const scriptId = open.params.scriptId;

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));

        const close = await waitForFrame(frames, (f) => f.method === "script/close");
        expect(close.params.scriptId).toBe(scriptId);
    });
});
