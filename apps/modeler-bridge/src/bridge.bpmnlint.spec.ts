/**
 * End-to-end coverage for the bpmnlint path on the bridge.
 *
 * Same harness style as `bridge.navigate.spec.ts`: the real bridge
 * (`createBridge`) runs against a fake transport (a frames array) over a real
 * temp filesystem, so the `BpmnLintConfigLocator` + `BpmnLintConfigService` +
 * `NodeBpmnLinter` do an actual nearest-`.bpmnlintrc` walk and run bpmnlint.
 * Covers the three tiers the webview's `GetBpmnlintConfigCommand` exposes: no
 * config hands linting to the webview's in-page default; a *covered* config is
 * pushed down for the webview to lint in-page (a config-carrying
 * `BpmnlintInPageQuery`, no host lint) and escalates to a host
 * `BpmnlintResultsQuery` only once the webview reports it cannot cover a rule; an
 * *escalating* config (a Node-only string moddleExtension) is linted host-side
 * straight away. The temp dir has no `node_modules`, so the host path resolves
 * built-in and camunda-compat rules from the bundled resolvers — the same path a
 * workspace without `bpmnlint` installed hits, and an unresolvable string
 * moddleExtension is recorded (never fatal), so the lint still produces findings.
 *
 * The suite also asserts the mid-session transitions the `.bpmnlintrc` watcher
 * drives: a config that *appears* takes the editor over to the host path (and
 * drops a stale in-page push arriving after the flip), and a config that is
 * *deleted* hands linting back to the webview's in-page default.
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

/**
 * Polls `frames` for the first entry (at or after `fromIndex`) matching
 * `predicate`. `onPoll` runs each miss — the watcher-driven tests re-touch the
 * `.bpmnlintrc` there, because fsevents can drop the first `add` after a
 * freshly-armed chokidar watch.
 */
async function waitForFrame(
    frames: any[],
    predicate: (frame: any) => boolean,
    timeoutMs = 2000,
    onPoll?: () => Promise<void> | void,
    fromIndex = 0,
): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const match = frames.slice(fromIndex).find(predicate);
        if (match) return match;
        await onPoll?.();
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("waitForFrame timed out");
}

// A host lint delivering actual findings. Requires non-null `results`: a
// `.bpmnlintrc` write is truncate-then-write, so the watcher can fire mid-write
// and read an empty file, whose failed JSON.parse degrades to a
// BpmnlintResultsQuery(null) deactivation frame. That transient must not satisfy
// a wait for the real host run (it crashes Object.keys and races the re-lint).
const isLintResultsFrame = (frame: any): boolean =>
    frame.method === "editor/postMessage" &&
    frame.params?.message?.type === "BpmnlintResultsQuery" &&
    frame.params?.message?.results != null;

const isInPageInstructionFrame = (frame: any): boolean =>
    frame.method === "editor/postMessage" && frame.params?.message?.type === "BpmnlintInPageQuery";

// A covered-config instruction: an in-page instruction that carries the
// workspace config + version token (vs. the payload-free zero-config default).
const isInPageConfigInstructionFrame = (frame: any): boolean =>
    isInPageInstructionFrame(frame) && frame.params?.message?.config != null;

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

    it("lints a covered .bpmnlintrc in-page — pushes the config, not host findings", async () => {
        const { rpc, frames, root, editorId } = await setup();
        await fs.writeFile(
            join(root, ".bpmnlintrc"),
            JSON.stringify({ extends: "bpmnlint:recommended" }),
            "utf8",
        );

        await requestConfig(rpc, editorId);

        // The bundled resolver covers `bpmnlint:recommended`, so the bridge pushes
        // the config down for the webview to lint in-page instead of running the
        // Node linter — a config-carrying instruction, never a results frame.
        const frame = await waitForFrame(frames, isInPageConfigInstructionFrame);
        expect(frame.params.message.config).toEqual({ extends: "bpmnlint:recommended" });
        expect(typeof frame.params.message.configToken).toBe("string");
        expect(frames.find(isLintResultsFrame)).toBeUndefined();
    });

    it("escalates a covered config to a host lint when the webview reports unresolved", async () => {
        const { rpc, frames, root, editorId } = await setup();
        await fs.writeFile(
            join(root, ".bpmnlintrc"),
            JSON.stringify({ extends: "bpmnlint:recommended" }),
            "utf8",
        );

        await requestConfig(rpc, editorId);
        const instruction = await waitForFrame(frames, isInPageConfigInstructionFrame);
        const token = instruction.params.message.configToken;

        // The webview reports a rule the bundled resolver could not cover, so the
        // bridge escalates that session to a host-side Node lint (results frame).
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: {
                        type: "UpdateLintResultsCommand",
                        results: {},
                        unresolved: ["bpmnlint-plugin-acme/foo"],
                        configToken: token,
                    },
                },
            }),
        );
        const resultsFrame = await waitForFrame(frames, isLintResultsFrame);
        expect(Object.keys(resultsFrame.params.message.results)).toContain("start-event-required");

        // The session is now escalated, so a later clean same-token in-page event
        // is stale and must be dropped — no "in-page results" debug log follows.
        const baseline = frames.length;
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: {
                        type: "UpdateLintResultsCommand",
                        results: {},
                        unresolved: [],
                        configToken: token,
                    },
                },
            }),
        );
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(frames.slice(baseline).find(isInPageResultsLog)).toBeUndefined();
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
        // Rule coverage for the bundled default lives in `lintParity.spec.ts`;
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

    it("takes the editor over to the host path when a .bpmnlintrc appears mid-session", async () => {
        // Start with no config: the editor is on the in-page path.
        const { rpc, frames, root, editorId } = await setup();
        await requestConfig(rpc, editorId);
        await waitForFrame(frames, isInPageInstructionFrame);

        // An *escalating* config (a Node-only string moddleExtension) so the
        // watcher takes the editor host-side and emits a results frame — a covered
        // config would only push an in-page instruction. The watcher re-lints the
        // moment the config lands; fsevents can drop the first `add` after a fresh
        // watch, so re-write inside the wait loop until the host results frame arrives.
        const writeConfig = () =>
            fs.writeFile(
                join(root, ".bpmnlintrc"),
                JSON.stringify({
                    extends: "bpmnlint:recommended",
                    moddleExtensions: { acme: "./acme.json" },
                }),
                "utf8",
            );
        await writeConfig();
        const frame = await waitForFrame(frames, isLintResultsFrame, 5000, writeConfig);
        expect(Object.keys(frame.params.message.results)).toContain("start-event-required");

        // The takeover flipped the mode to "external" *before* the results push,
        // so a webview in-page push arriving now is stale and must be dropped —
        // no "in-page results" debug log should follow.
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: {
                    editorId,
                    message: {
                        type: "UpdateLintResultsCommand",
                        results: {
                            "start-event-required": [
                                { id: "Process_1", message: "stale", category: "error" },
                            ],
                        },
                        unresolved: [],
                    },
                },
            }),
        );
        await new Promise((resolve) => setTimeout(resolve, 150));
        expect(frames.find(isInPageResultsLog)).toBeUndefined();
    });

    it("hands linting back to the webview in-page when the .bpmnlintrc is deleted mid-session", async () => {
        const { rpc, frames, root, editorId } = await setup();
        const configPath = join(root, ".bpmnlintrc");
        // Escalating config so the initial request lints host-side (results frame);
        // deleting it must then hand linting back to the in-page default.
        await fs.writeFile(
            configPath,
            JSON.stringify({
                extends: "bpmnlint:recommended",
                moddleExtensions: { acme: "./acme.json" },
            }),
            "utf8",
        );

        await requestConfig(rpc, editorId);
        await waitForFrame(frames, isLintResultsFrame);

        // Only frames emitted *after* the deletion count — the deletion must
        // produce a fresh in-page handback, not the pre-existing results frame.
        const baseline = frames.length;
        await fs.rm(configPath);
        await waitForFrame(
            frames,
            (frame) => isInPageInstructionFrame(frame),
            5000,
            undefined,
            baseline,
        );
    });
});
