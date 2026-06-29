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
import { dirname, join } from "node:path";

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
    variables?: { name: string; origin: string; confidence: string }[];
}

describe("bridge script editor (real core over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    async function setup(options?: {
        manifest?: string;
    }): Promise<{ rpc: Rpc; frames: any[]; editorId: string }> {
        const root = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-script-"));
        const sourcePath = join(root, "source.bpmn");
        await fs.writeFile(sourcePath, C7_XML, "utf8");
        // Written before session/register so the script feature's onSessionRegistered
        // hook reads it into the editor's manifest source. The manifest now lives
        // under `<configFolder>/vars/<relBpmn>.vars.json`, not beside the diagram.
        if (options?.manifest !== undefined) {
            const varsDir = join(root, ".camunda", "vars");
            await fs.mkdir(varsDir, { recursive: true });
            await fs.writeFile(join(varsDir, "source.bpmn.vars.json"), options.manifest, "utf8");
        }

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

    it("ships SPIN globals and the SpinJsonNode type table when the setting is on", async () => {
        const { rpc, frames, editorId } = await setup();

        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "",
        });

        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        const globalNames = open.params.completion.globals.map((g: { name: string }) => g.name);
        expect(globalNames).toEqual(["S", "JSON"]);
        // The full COMPLEX_TYPES map ships; the host only consults it on a
        // `typeHint` lookup, and SpinJsonNode is the only hint 2b stamps.
        expect(Object.keys(open.params.completion.types)).toContain("SpinJsonNode");
        const methodNames = open.params.completion.types.SpinJsonNode.map(
            (m: { name: string }) => m.name,
        );
        expect(methodNames).toContain("prop");
        expect(methodNames).toContain("stringValue");
    });

    it("ships empty SPIN globals/types when the scripting.spin setting is off", async () => {
        const { rpc, frames, editorId } = await setup();

        // Host pushes the SPIN gate off; the bridge is the single source of the
        // gate, so the payload must carry nothing rather than the host filtering.
        await rpc.handleLine(
            JSON.stringify({
                method: "settings/didChange",
                params: { settings: { scriptingSpin: false } },
            }),
        );

        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "",
        });

        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        expect(open.params.completion.globals).toEqual([]);
        expect(open.params.completion.types).toEqual({});
    });

    it("carries the seeded variables in the script/open completion payload", async () => {
        const { rpc, frames, editorId } = await setup();
        const variables = [{ name: "amount", origin: "form field", confidence: "declared" }];

        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "",
            variables,
        });

        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        expect(open.params.completion.variables).toEqual(variables);
    });

    it("merges the *.bpmn.vars.json manifest into the script/open payload, manifest winning a clash", async () => {
        const { rpc, frames, editorId } = await setup({
            manifest: JSON.stringify({
                variables: [
                    { name: "orderId", type: "String", description: "Set by REST start" },
                    { name: "amount", type: "Long" },
                ],
            }),
        });

        // `amount` also arrives as an extracted (heuristic) variable — the
        // manifest's authored entry must win the clash.
        const variables = [{ name: "amount", origin: "form field", confidence: "declared" }];
        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "",
            variables,
        });

        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        const byName: Record<string, any> = Object.fromEntries(
            open.params.completion.variables.map((v: { name: string }) => [v.name, v]),
        );

        expect(byName.orderId).toMatchObject({
            typeHint: "String",
            description: "Set by REST start",
            confidence: "authored",
        });
        // The authored `amount` (type Long) wins over the extracted form field.
        expect(byName.amount).toMatchObject({ typeHint: "Long", confidence: "authored" });
        expect(open.params.completion.variables).toHaveLength(2);
    });

    it("appends to the manifest, reveals it, and re-pushes updateVariables on script/appendToManifest", async () => {
        const { rpc, frames, editorId } = await setup({
            manifest: JSON.stringify({ variables: [{ name: "orderId", type: "String" }] }),
        });

        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "",
        });
        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        const scriptId = open.params.scriptId;

        await rpc.handleLine(
            JSON.stringify({
                method: "script/appendToManifest",
                params: { scriptId, name: "amount" },
            }),
        );

        // (a) the reveal frame carries the resolved manifest path …
        const reveal = await waitForFrame(frames, (f) => f.method === "notifier/openDocument");
        const sourcePath = editorId.replace(/^file:\/\//, "");
        const manifestPath = join(dirname(sourcePath), ".camunda", "vars", "source.bpmn.vars.json");
        expect(reveal.params.path).toBe(manifestPath);

        // (b) … the entry was appended on disk (the existing entry preserved) …
        const onDisk = JSON.parse(await fs.readFile(manifestPath, "utf8"));
        expect(onDisk.variables).toEqual([{ name: "orderId", type: "String" }, { name: "amount" }]);

        // (c) … and the append re-pushes the merged var to the tab (done eagerly,
        // not via the fs watcher, so it is deterministic and does not race a write).
        const update = await waitForFrame(
            frames,
            (f) =>
                f.method === "script/updateVariables" &&
                f.params.scriptId === scriptId &&
                f.params.variables.some((v: { name: string }) => v.name === "amount"),
        );
        expect(update.params.variables.map((v: { name: string }) => v.name)).toEqual(
            expect.arrayContaining(["orderId", "amount"]),
        );
    });

    it("opens a diagram without a manifest without logging an error", async () => {
        // Exercises the real NodeWorkspace.readFile ENOENT path: a missing
        // manifest must read as "absent" (FileNotFound), not rethrow and get
        // logged at error level on every editor open. `setup()` writes no
        // `.camunda/vars/*.vars.json`, so session/register hits the absent-manifest branch.
        const { rpc, frames, editorId } = await setup();
        await settle();

        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "",
            variables: [{ name: "amount", origin: "form field", confidence: "declared" }],
        });

        const errorLog = frames.find(
            (f) => f.method === "notifier/log" && f.params?.level === "error",
        );
        expect(errorLog).toBeUndefined();

        // With no manifest the payload carries only the extracted variables.
        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        expect(open.params.completion.variables).toEqual([
            { name: "amount", origin: "form field", confidence: "declared" },
        ]);
    });

    it("pushes script/updateVariables for that editor's open scripts only", async () => {
        const { rpc, frames, editorId } = await setup();
        await feedOpen(rpc, editorId, {
            elementId: "Task_1",
            kind: "script-task",
            listenerIndex: undefined,
            eventName: undefined,
            scriptFormat: "groovy",
            content: "",
        });
        const open = await waitForFrame(frames, (f) => f.method === "script/open");
        const scriptId = open.params.scriptId;

        const variables = [{ name: "total", origin: "output mapping", confidence: "declared" }];
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: { type: "UpdateScriptVariablesCommand", variables },
                },
            }),
        );

        const update = await waitForFrame(frames, (f) => f.method === "script/updateVariables");
        expect(update.params.scriptId).toBe(scriptId);
        expect(update.params.variables).toEqual(variables);
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
