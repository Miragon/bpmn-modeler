/**
 * End-to-end coverage for the "Go to referenced model" RPC path on the bridge.
 *
 * Same harness style as `server.spec.ts`: the real bridge (`createBridge`) runs
 * against a fake transport (a frames array) over a real temp filesystem, so the
 * `ReferencedModelLocator` + `ModelNavigationService` it constructs do an
 * actual `fs.glob` + read-and-regex search. The tests cover the four branches
 * the navigation flow exposes to the host: single-match (direct open), multi-
 * match (picker round-trip), no-match (info balloon, no open), and unknown
 * `referenceKind` (warn log, no search).
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

const C7_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.20.0">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

/** XML whose `<bpmn:process id>` matches `id`, used to seed target files. */
function bpmnWithProcessId(id: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_X" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="${id}" isExecutable="true" />
</bpmn:definitions>`;
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Waits for a frame matching `predicate` to land, or rejects after `timeoutMs`.
 * The navigation flow awaits the picker's `searchAndPickReferencedModel` → an
 * async fs.glob → an `await Promise.all` over per-file reads, so a single
 * `settle()` isn't enough turns to drain it; polling lets the test stay
 * deterministic without coupling to the number of microtasks the flow chains.
 */
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

describe("bridge navigation (real core + locator over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    /**
     * Builds a bridge whose emitted frames are captured, over a fresh temp
     * workspace, then registers a single source editor so the handler has a
     * valid `editorStore.requireHandle(editorId)`. Returns everything the
     * tests need to feed inbound frames and inspect outbound ones.
     */
    async function setup(): Promise<{
        rpc: Rpc;
        frames: any[];
        root: string;
        sourcePath: string;
        editorId: string;
    }> {
        const root = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-nav-"));
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
        return { rpc, frames, root, sourcePath, editorId };
    }

    async function feedNavigate(
        rpc: Rpc,
        editorId: string,
        referenceId: string,
        referenceKind: unknown,
    ): Promise<void> {
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: {
                        type: "NavigateToReferencedModelCommand",
                        referenceId,
                        referenceKind,
                    },
                },
            }),
        );
        await settle();
    }

    it("opens the file directly when exactly one model declares the id", async () => {
        const { rpc, frames, root, editorId } = await setup();
        const targetPath = join(root, "target.bpmn");
        const otherPath = join(root, "other.bpmn");
        await fs.writeFile(targetPath, bpmnWithProcessId("Target"), "utf8");
        await fs.writeFile(otherPath, bpmnWithProcessId("Unrelated"), "utf8");

        await feedNavigate(rpc, editorId, "Target", "process");

        const open = await waitForFrame(frames, (f) => f.method === "notifier/openDocument");
        expect(open.params.path).toBe(targetPath);
        // A single match must short-circuit the picker.
        expect(frames.find((f) => f.method === "picker/show")).toBeUndefined();
        expect(frames.filter((f) => f.method === "notifier/openDocument")).toHaveLength(1);
    });

    it("prompts via picker/show when multiple files declare the id, then opens the choice", async () => {
        const { rpc, frames, root, editorId } = await setup();
        const aPath = join(root, "a.bpmn");
        const bPath = join(root, "b.bpmn");
        await fs.writeFile(aPath, bpmnWithProcessId("Shared"), "utf8");
        await fs.writeFile(bPath, bpmnWithProcessId("Shared"), "utf8");

        await feedNavigate(rpc, editorId, "Shared", "process");

        const picker = await waitForFrame(
            frames,
            (f) => f.method === "picker/show" && f.id != null,
        );
        expect(picker.params.canPickMany).toBe(false);
        const labels = picker.params.items.map((it: { description: string }) => it.description);
        expect(labels).toEqual([...labels].sort());
        expect(new Set(labels)).toEqual(new Set([aPath, bPath]));

        // Reply selecting the first item; the service then forwards it as openDocument.
        await rpc.handleLine(JSON.stringify({ id: picker.id, result: { selected: [0] } }));

        const open = await waitForFrame(frames, (f) => f.method === "notifier/openDocument");
        expect(open.params.path).toBe(labels[0]);
    });

    it("emits showInfo and no open when no model declares the id", async () => {
        const { rpc, frames, root, editorId } = await setup();
        const path = join(root, "other.bpmn");
        await fs.writeFile(path, bpmnWithProcessId("Unrelated"), "utf8");

        await feedNavigate(rpc, editorId, "Missing", "process");

        const info = await waitForFrame(frames, (f) => f.method === "notifier/showInfo");
        expect(String(info.params.message)).toContain("Missing");
        expect(frames.find((f) => f.method === "notifier/openDocument")).toBeUndefined();
        expect(frames.find((f) => f.method === "picker/show")).toBeUndefined();
    });

    it("rejects an unknown referenceKind with a warn log and no search", async () => {
        const { rpc, frames, root, editorId } = await setup();
        // Seed a candidate file so a fall-through bug would visibly hit `findFiles`.
        await fs.writeFile(join(root, "target.bpmn"), bpmnWithProcessId("Target"), "utf8");

        // Reset frames so the assertion isn't muddied by the register-time logs.
        const before = frames.length;
        await feedNavigate(rpc, editorId, "Target", "spell");

        const newFrames = frames.slice(before);
        expect(newFrames.find((f) => f.method === "notifier/openDocument")).toBeUndefined();
        expect(newFrames.find((f) => f.method === "picker/show")).toBeUndefined();
        // The service's own progress/showInfo paths must not run either — the
        // guard is meant to short-circuit before the locator is touched.
        expect(newFrames.find((f) => f.method === "notifier/progressStart")).toBeUndefined();
        const warn = newFrames.find(
            (f) => f.method === "notifier/log" && f.params.level === "warn",
        );
        expect(warn).toBeDefined();
        expect(String(warn.params.message)).toContain("spell");
    });
});
