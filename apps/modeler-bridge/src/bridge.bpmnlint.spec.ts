/**
 * End-to-end coverage for the bpmnlint config path on the bridge.
 *
 * Same harness style as `bridge.navigate.spec.ts`: the real bridge
 * (`createBridge`) runs against a fake transport (a frames array) over a real
 * temp filesystem, so the `BpmnLintConfigLocator` + `BpmnLintConfigService` do an
 * actual nearest-`.bpmnlintrc` walk and read. Covers the two branches the
 * webview's `GetBpmnlintConfigCommand` exposes: a discovered config is parsed and
 * pushed as `BpmnlintConfigQuery`, and no config pushes `config: null` so the
 * webview deactivates linting.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true" />
</bpmn:definitions>`;

function registerParams(editorId: string, root: string, fsPath: string) {
    return {
        editorId,
        uriString: editorId,
        path: fsPath,
        fsPath,
        scheme: "file",
        workspaceRoot: root,
        content: BPMN_XML,
    };
}

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

const isLintConfigFrame = (frame: any): boolean =>
    frame.method === "editor/postMessage" && frame.params?.message?.type === "BpmnlintConfigQuery";

describe("bridge bpmnlint (real core + locator over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    async function setup(): Promise<{ rpc: Rpc; frames: any[]; root: string; editorId: string }> {
        const root = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-lint-"));
        const sourcePath = join(root, "source.bpmn");
        await fs.writeFile(sourcePath, BPMN_XML, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge((line) => frames.push(JSON.parse(line)));
        const editorId = `file://${sourcePath}`;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, sourcePath),
            }),
        );

        cleanups.push(() => fs.rm(root, { recursive: true, force: true }));
        return { rpc, frames, root, editorId };
    }

    async function requestConfig(rpc: Rpc, editorId: string): Promise<void> {
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: { editorId, message: { type: "GetBpmnlintConfigCommand" } },
            }),
        );
    }

    it("pushes the nearest .bpmnlintrc contents to the webview", async () => {
        const { rpc, frames, root, editorId } = await setup();
        await fs.writeFile(
            join(root, ".bpmnlintrc"),
            JSON.stringify({ extends: "bpmnlint:recommended" }),
            "utf8",
        );

        await requestConfig(rpc, editorId);

        const frame = await waitForFrame(frames, isLintConfigFrame);
        expect(frame.params.message.config).toEqual({ extends: "bpmnlint:recommended" });
    });

    it("pushes a null config when no .bpmnlintrc exists so linting deactivates", async () => {
        const { rpc, frames, editorId } = await setup();

        await requestConfig(rpc, editorId);

        const frame = await waitForFrame(frames, isLintConfigFrame);
        expect(frame.params.message.config).toBeNull();
    });
});
