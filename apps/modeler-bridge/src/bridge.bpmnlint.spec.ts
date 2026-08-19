/**
 * End-to-end coverage for the bpmnlint path on the bridge.
 *
 * Same harness style as `bridge.navigate.spec.ts`: the real bridge
 * (`createBridge`) runs against a fake transport (a frames array) over a real
 * temp filesystem, so the `BpmnLintConfigLocator` + `BpmnLintConfigService` +
 * `NodeBpmnLinter` do an actual nearest-`.bpmnlintrc` walk and run bpmnlint.
 * Covers the two branches the webview's `GetBpmnlintConfigCommand` exposes: a
 * discovered config is linted and the findings pushed as `BpmnlintResultsQuery`,
 * and no config falls back to the bundled default (#1327) rather than deactivating.
 * The temp dir has no `node_modules`, so built-in and camunda-compat rules resolve
 * from the bundled resolvers — the same path a workspace without `bpmnlint`
 * installed hits.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

// A process with a task but no start/end event, so bpmnlint:recommended reports
// (start-event-required, end-event-required, …) — proving the host actually linted.
const BPMN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="Do the thing" />
  </bpmn:process>
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

const isLintResultsFrame = (frame: any): boolean =>
    frame.method === "editor/postMessage" && frame.params?.message?.type === "BpmnlintResultsQuery";

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

    it("lints against the nearest .bpmnlintrc and pushes the findings to the webview", async () => {
        const { rpc, frames, root, editorId } = await setup();
        await fs.writeFile(
            join(root, ".bpmnlintrc"),
            JSON.stringify({ extends: "bpmnlint:recommended" }),
            "utf8",
        );

        await requestConfig(rpc, editorId);

        const frame = await waitForFrame(frames, isLintResultsFrame);
        const results = frame.params.message.results;
        expect(results).not.toBeNull();
        // recommended flags the missing start event on the process containing Task_1.
        expect(Object.keys(results)).toContain("start-event-required");
    });

    it("lints against the bundled default when no .bpmnlintrc exists", async () => {
        const { rpc, frames, editorId } = await setup();

        await requestConfig(rpc, editorId);

        const frame = await waitForFrame(frames, isLintResultsFrame);
        const results = frame.params.message.results;
        expect(results).not.toBeNull();
        expect(Object.keys(results)).toContain("start-event-required");
    });
});
