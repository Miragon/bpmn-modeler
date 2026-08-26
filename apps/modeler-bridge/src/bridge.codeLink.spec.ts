/**
 * End-to-end coverage for the code-link RPC paths on the bridge.
 *
 * Same harness as `bridge.navigate.spec.ts`: the real bridge (`createBridge`)
 * runs against a fake transport (a frames array) over a real temp filesystem, so
 * the `CodeLinkMapService` + `ImplementationLocator` it constructs do an actual
 * `fs.glob` + path/content match. The tests cover the host-visible behaviour:
 * `SyncActivitiesCommand` resolving (and not resolving) an entry into an
 * `ImplementationStatusQuery`, `NavigateToImplementationCommand` opening the
 * single match, and the unknown-`kind` guard short-circuiting before any search.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { implementationStatusKey } from "@miragon/bpmn-modeler-types";

import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

const C7_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

/** A minimal Java class file body; the locator resolves `javaClass` by path alone. */
function javaClass(packageName: string, className: string): string {
    return `package ${packageName};\n\npublic class ${className} {}\n`;
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Waits for a frame matching `predicate`, or rejects after `timeoutMs`. The sync
 * path chains an async attach → fs.glob → per-file work before the status push,
 * so polling keeps the test deterministic without counting microtasks.
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

describe("bridge code link (real core + map/locator over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    async function setup(): Promise<{
        rpc: Rpc;
        frames: any[];
        root: string;
        editorId: string;
    }> {
        const root = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-link-"));
        const sourcePath = join(root, "process.bpmn");
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
        return { rpc, frames, root, editorId };
    }

    /** Drops a Java class at the conventional `<src>/<pkg path>/<Class>.java` location. */
    async function writeJava(root: string, fqcn: string): Promise<void> {
        const segments = fqcn.split(".");
        const className = segments.pop()!;
        const packageName = segments.join(".");
        const dir = join(root, "src", "main", "java", ...segments);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(
            join(dir, `${className}.java`),
            javaClass(packageName, className),
            "utf8",
        );
    }

    it("resolves a javaClass activity to true and an unbacked one to false", async () => {
        const { rpc, frames, root, editorId } = await setup();
        await writeJava(root, "com.example.OrderDelegate");

        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: {
                        type: "SyncActivitiesCommand",
                        entries: [
                            {
                                activityId: "Task_Resolved",
                                kind: "javaClass",
                                reference: "com.example.OrderDelegate",
                            },
                            {
                                activityId: "Task_Missing",
                                kind: "javaClass",
                                reference: "com.example.DoesNotExist",
                            },
                        ],
                    },
                },
            }),
        );

        const status = await waitForFrame(
            frames,
            (f) =>
                f.method === "editor/postMessage" &&
                f.params.message.type === "ImplementationStatusQuery",
        );
        const { resolved } = status.params.message;
        expect(
            resolved[implementationStatusKey("Task_Resolved", "com.example.OrderDelegate")],
        ).toBe(true);
        expect(resolved[implementationStatusKey("Task_Missing", "com.example.DoesNotExist")]).toBe(
            false,
        );
    });

    it("opens the single match on NavigateToImplementationCommand without a picker", async () => {
        const { rpc, frames, root, editorId } = await setup();
        await writeJava(root, "com.example.PaymentDelegate");
        const targetPath = join(
            root,
            "src",
            "main",
            "java",
            "com",
            "example",
            "PaymentDelegate.java",
        );

        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: {
                        type: "NavigateToImplementationCommand",
                        reference: "com.example.PaymentDelegate",
                        kind: "javaClass",
                    },
                },
            }),
        );

        const open = await waitForFrame(frames, (f) => f.method === "notifier/openDocument");
        expect(open.params.path).toBe(targetPath);
        // A single match must short-circuit the picker.
        expect(frames.find((f) => f.method === "picker/show")).toBeUndefined();
    });

    it("rejects an unknown implementation kind with a warn log and no search", async () => {
        const { rpc, frames, root, editorId } = await setup();
        // Seed a real candidate so a fall-through bug would visibly open something.
        await writeJava(root, "com.example.PaymentDelegate");

        const before = frames.length;
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: {
                        type: "NavigateToImplementationCommand",
                        reference: "com.example.PaymentDelegate",
                        kind: "sorcery",
                    },
                },
            }),
        );
        await settle();

        const newFrames = frames.slice(before);
        expect(newFrames.find((f) => f.method === "notifier/openDocument")).toBeUndefined();
        expect(newFrames.find((f) => f.method === "picker/show")).toBeUndefined();
        // The guard must short-circuit before the locator's progress spinner.
        expect(newFrames.find((f) => f.method === "notifier/progressStart")).toBeUndefined();
        const warn = newFrames.find(
            (f) => f.method === "notifier/log" && f.params.level === "warn",
        );
        expect(warn).toBeDefined();
        expect(String(warn.params.message)).toContain("sorcery");
    });
});
