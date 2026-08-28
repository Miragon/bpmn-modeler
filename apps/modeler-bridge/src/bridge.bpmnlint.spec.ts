/**
 * End-to-end coverage for the bpmnlint path on the bridge.
 *
 * Same harness style as `bridge.navigate.spec.ts`: the real bridge
 * (`createBridge`) runs against a fake transport (a frames array) over a real
 * temp filesystem, so the `BpmnLintConfigLocator` + `BpmnLintConfigService` +
 * `NodeBpmnLinter` do an actual nearest-`.bpmnlintrc` walk and run bpmnlint.
 * Covers the two branches the webview's `GetBpmnlintConfigCommand` exposes: a
 * discovered config is linted host-side and the findings pushed as
 * `BpmnlintResultsQuery`, and no config hands linting to the webview's in-page
 * default (#1373 Phase B) — the bridge posts a `BpmnlintInPageQuery` instead of
 * linting host-side, then accepts the webview's own findings back through
 * `UpdateLintResultsCommand`. The temp dir has no `node_modules`, so the
 * workspace-config path resolves built-in and camunda-compat rules from the
 * bundled resolvers — the same path a workspace without `bpmnlint` installed hits.
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

// Same process, now with DI whose task shape is far from the modeler default
// (100×80) — so the miragon layer's `standard-size` rule fires. Missing DI is
// valid for that rule, hence the explicit shape here.
const BPMN_XML_OVERSIZED = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="Do the thing" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="160" y="80" width="200" height="200" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function registerParams(editorId: string, root: string, fsPath: string, content = BPMN_XML) {
    return {
        editorId,
        uriString: editorId,
        path: fsPath,
        fsPath,
        scheme: "file",
        workspaceRoot: root,
        content,
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

const isInPageInstructionFrame = (frame: any): boolean =>
    frame.method === "editor/postMessage" && frame.params?.message?.type === "BpmnlintInPageQuery";

const isInPageResultsLog = (frame: any): boolean =>
    frame.method === "notifier/log" &&
    typeof frame.params?.message === "string" &&
    frame.params.message.includes("in-page results");

describe("bridge bpmnlint (real core + locator over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    async function setup(
        content = BPMN_XML,
    ): Promise<{ rpc: Rpc; frames: any[]; root: string; editorId: string }> {
        const root = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-lint-"));
        const sourcePath = join(root, "source.bpmn");
        await fs.writeFile(sourcePath, content, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge((line) => frames.push(JSON.parse(line)));
        const editorId = `file://${sourcePath}`;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, sourcePath, content),
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

    it("hands linting to the webview in-page (no host lint) when no .bpmnlintrc exists", async () => {
        const { rpc, frames, editorId } = await setup();

        await requestConfig(rpc, editorId);

        // The bridge tells the webview to run its own default rather than linting
        // host-side, so it posts a BpmnlintInPageQuery and never a results query.
        await waitForFrame(frames, isInPageInstructionFrame);
        expect(frames.find(isLintResultsFrame)).toBeUndefined();
    });

    it("accepts the webview's in-page findings back over UpdateLintResultsCommand", async () => {
        // Rule coverage for the bundled default now lives in the AC5 parity spec;
        // here we prove the webview→host results command is wired: after the
        // no-config in-page handback, a pushed UpdateLintResultsCommand is
        // accepted and applied (the debug log confirms the round-trip). The
        // bridge has no Problems panel / status bar, so the log is the only
        // observable effect.
        const { rpc, frames, editorId } = await setup(BPMN_XML_OVERSIZED);

        await requestConfig(rpc, editorId);
        await waitForFrame(frames, isInPageInstructionFrame);

        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: {
                        type: "UpdateLintResultsCommand",
                        results: {
                            "standard-size": [
                                { id: "Task_1", message: "Task too large", category: "warn" },
                            ],
                        },
                        unresolved: [],
                    },
                },
            }),
        );

        await waitForFrame(frames, isInPageResultsLog);
    });
});
