/**
 * End-to-end coverage for the portable modeler-command RPC paths on the bridge
 * (change engine version, migrate all). Same harness as `bridge.marketplace.spec.ts`:
 * the real bridge (`createBridge`) runs against a fake transport over a real temp
 * filesystem, so the `BpmnModelerService` / `BpmnMigrationService` it constructs do
 * genuine document reads and fs globs.
 *
 * Both commands surface their next step as an outbound `picker/show` (the engine
 * version chooser), which is what these tests assert — proving the notification is
 * wired into the real core service without needing to drive the full write path.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

const BPMN_C7_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.20.0">
  <bpmn:process id="Process_1" isExecutable="true" camunda:historyTimeToLive="180" />
</bpmn:definitions>`;

/** Polls for a frame matching `predicate`, or rejects after `timeoutMs`. */
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
        settings: {},
    };
}

const isPickerShow = (f: any) => f.method === "picker/show" && f.id != null;

describe("bridge modeler commands (real core over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    async function setup(): Promise<{
        rpc: Rpc;
        frames: any[];
        editorId: string;
        workspaceRoot: string;
        sourcePath: string;
    }> {
        const tmp = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-cmd-"));
        const workspaceRoot = join(tmp, "workspace");
        await fs.mkdir(workspaceRoot, { recursive: true });
        const sourcePath = join(workspaceRoot, "process.bpmn");
        await fs.writeFile(sourcePath, BPMN_C7_XML, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge(
            (line) => frames.push(JSON.parse(line)),
            () => {},
            {
                homeDir: tmp,
            },
        );
        const editorId = `file://${sourcePath}`;

        cleanups.push(() => fs.rm(tmp, { recursive: true, force: true }));
        return { rpc, frames, editorId, workspaceRoot, sourcePath };
    }

    it("change engine version: opens the version picker for the registered editor", async () => {
        const { rpc, frames, editorId, workspaceRoot, sourcePath } = await setup();
        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, workspaceRoot, sourcePath, BPMN_C7_XML),
            }),
        );

        // Not awaited: the handler awaits the picker reply that never comes here (as
        // in production, `server.ts` fire-and-forgets each line, so a blocked handler
        // never stalls the reader). Awaiting handleLine would deadlock the test.
        void rpc.handleLine(
            JSON.stringify({ method: "modeler/changeEngineVersion", params: { editorId } }),
        );

        const picker = await waitForFrame(frames, isPickerShow);
        expect(Array.isArray(picker.params.items)).toBe(true);
        expect(picker.params.items.length).toBeGreaterThan(0);
    });

    it("migrate all: globs the workspace root and opens the version picker", async () => {
        const { rpc, frames, workspaceRoot } = await setup();

        // No session/register first — migrate must register the root itself, so the
        // fs glob finds the .bpmn written under it. Not awaited (see above).
        void rpc.handleLine(
            JSON.stringify({ method: "migration/migrateAll", params: { workspaceRoot } }),
        );

        const picker = await waitForFrame(frames, isPickerShow);
        expect(Array.isArray(picker.params.items)).toBe(true);
        expect(picker.params.items.length).toBeGreaterThan(0);
    });
});
