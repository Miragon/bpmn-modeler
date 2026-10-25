/**
 * End-to-end coverage for the clipboard round trip on the bridge: the sandboxed
 * webview asks the core to read or write the system clipboard, and the core
 * delegates to the host over `clipboard/read` / `clipboard/write`.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    hostErrorReply,
    hostNotification,
    hostReply,
    registerParams,
    settle,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./bridge";

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

const isClipboardRead = (f: any) => f.method === "clipboard/read" && f.id != null;
const postedQueries = (frames: any[], type: string) =>
    frames.filter((f) => f.method === "editor/postMessage" && f.params.message?.type === type);

describe("bridge clipboard (real core over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    async function setupWithOpenEditor() {
        const tmp = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-clipboard-"));
        cleanups.push(() => fs.rm(tmp, { recursive: true, force: true }));
        const sourcePath = join(tmp, "process.bpmn");
        await fs.writeFile(sourcePath, BPMN_XML, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge(
            (line) => frames.push(JSON.parse(line)),
            () => {},
            { homeDir: tmp },
        );
        const editorId = `file://${sourcePath}`;
        await rpc.handleLine(
            hostNotification(
                "session/register",
                registerParams(editorId, tmp, sourcePath, BPMN_XML),
            ),
        );

        const sendFromWebview = (message: Record<string, unknown>) =>
            rpc.handleLine(hostNotification("webview/message", { editorId, message }));

        return { rpc, frames, editorId, sendFromWebview };
    }

    it.each([
        ["GetClipboardCommand", "ClipboardQuery"],
        ["GetTextClipboardCommand", "TextClipboardQuery"],
    ])("answers %s with the host clipboard as a %s", async (command, query) => {
        const { rpc, frames, editorId, sendFromWebview } = await setupWithOpenEditor();

        await sendFromWebview({ type: command });
        const read = await waitForFrame(frames, isClipboardRead);
        await rpc.handleLine(hostReply(read.id, { text: "<bpmn-copy/>" }));

        const posted = await waitForFrame(
            frames,
            (f) => f.method === "editor/postMessage" && f.params.message?.type === query,
        );
        expect(posted.params.editorId).toBe(editorId);
        expect(posted.params.message.text).toBe("<bpmn-copy/>");
    });

    it.each(["SetClipboardCommand", "SetTextClipboardCommand"])(
        "writes the text of a %s to the host clipboard",
        async (command) => {
            const { frames, sendFromWebview } = await setupWithOpenEditor();

            await sendFromWebview({ type: command, text: "copied" });

            const write = await waitForFrame(frames, (f) => f.method === "clipboard/write");
            expect(write.params).toEqual({ text: "copied" });
        },
    );

    it.each([
        ["GetClipboardCommand", "ClipboardQuery"],
        ["GetTextClipboardCommand", "TextClipboardQuery"],
    ])("logs a refused read and still answers %s with an empty %s", async (command, query) => {
        const { rpc, frames, editorId, sendFromWebview } = await setupWithOpenEditor();

        await sendFromWebview({ type: command });
        const read = await waitForFrame(frames, isClipboardRead);
        await rpc.handleLine(hostErrorReply(read.id, "denied"));
        await settle();

        expect(frames).toContainEqual({
            method: "notifier/log",
            params: { level: "error", message: "denied" },
        });
        const answers = postedQueries(frames, query);
        expect(answers).toHaveLength(1);
        expect(answers[0].params.editorId).toBe(editorId);
        expect(answers[0].params.message.text).toBe("");
    });
});
