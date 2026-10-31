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

import { afterEach, describe, expect, it, vi } from "vitest";

import { RawModelerSettings } from "@miragon/bpmn-modeler-core";

import {
    hostNotification,
    hostReply,
    isStatusSlotUpdate,
    registerParams,
    settle,
    StatusSlotFrame,
    waitForFrame,
} from "./__fixtures__/bridgeHarness";
import { createBridge } from "./bridge";
import { NodeWorkspace } from "./nodeAdapters";
import { StatusBarUpdateParams } from "./protocol/types";
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

const isLintDisabledFrame = (frame: any): boolean =>
    frame.method === "editor/postMessage" &&
    frame.params?.message?.type === "BpmnLintDisabledQuery";

const isLintChoiceReport = (frame: any): boolean =>
    frame.method === "settings/setLintingEnabled" && frame.id != null;

const isInPageResultsLog = (frame: any): boolean =>
    frame.method === "notifier/log" &&
    typeof frame.params?.message === "string" &&
    frame.params.message.includes("in-page results");

/** The host shows one BPMNlint widget, so the last update of its slot is what it shows now. */
function shownLintStatus(
    frames: readonly StatusSlotFrame[],
    fromIndex = 0,
): StatusBarUpdateParams["view"] | undefined {
    const updates = frames.slice(fromIndex).filter(isStatusSlotUpdate("bpmnlint"));
    return updates[updates.length - 1]?.params?.view;
}

describe("bridge bpmnlint (real core + locator over a fake transport)", () => {
    const cleanups: Array<() => Promise<void> | void> = [];

    afterEach(async () => {
        for (const cleanup of cleanups.splice(0)) {
            await cleanup();
        }
    });

    /** Answers a reported lint choice as the IntelliJ host does: persist it, push the snapshot, ack. */
    async function persistLintChoice(rpc: Rpc, report: any): Promise<void> {
        await rpc.handleLine(
            hostNotification("settings/didChange", {
                settings: { lintingEnabled: report.params.enabled },
            }),
        );
        await rpc.handleLine(hostReply(report.id, null));
    }

    async function setup({
        content = BPMN_XML,
        settings,
        hostPersistsLintChoices = true,
    }: {
        content?: string;
        settings?: RawModelerSettings;
        hostPersistsLintChoices?: boolean;
    } = {}): Promise<{ rpc: Rpc; frames: any[]; root: string; editorId: string }> {
        const root = await fs.mkdtemp(join(tmpdir(), "modeler-bridge-lint-"));
        const sourcePath = join(root, "source.bpmn");
        await fs.writeFile(sourcePath, content, "utf8");

        const frames: any[] = [];
        const { rpc } = createBridge((line) => {
            const frame = JSON.parse(line);
            frames.push(frame);
            if (hostPersistsLintChoices && isLintChoiceReport(frame)) {
                setTimeout(() => void persistLintChoice(rpc, frame));
            }
        });
        const editorId = `file://${sourcePath}`;

        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(editorId, root, sourcePath, content, { settings }),
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

    async function toggleLinting(rpc: Rpc, editorId: string, enabled: boolean): Promise<void> {
        await rpc.handleLine(
            JSON.stringify({
                method: "webview/message",
                params: { editorId, message: { type: "SetLintingEnabledCommand", enabled } },
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

    it("shows the bundled default in the host's BPMNlint slot when no .bpmnlintrc exists", async () => {
        const { rpc, frames, editorId } = await setup();

        await requestConfig(rpc, editorId);
        await waitForFrame(frames, isInPageInstructionFrame);

        expect(shownLintStatus(frames)).toEqual({
            text: "BPMNlint (default)",
            icon: "shield",
            tooltip:
                "Linting against the bundled default (no execution platform).\nAdd a .bpmnlintrc to your workspace to override it.",
            tone: "neutral",
        });
    });

    it("hides the host's BPMNlint slot when the diagram closes", async () => {
        const { rpc, frames, editorId } = await setup();
        await requestConfig(rpc, editorId);
        await waitForFrame(frames, isInPageInstructionFrame);
        const beforeClose = frames.length;

        await rpc.handleLine(JSON.stringify({ method: "session/dispose", params: { editorId } }));

        expect(shownLintStatus(frames, beforeClose)).toBeNull();
    });

    it("accepts the webview's in-page findings back over UpdateLintResultsCommand", async () => {
        // Rule coverage for the bundled default lives in `lintParity.spec.ts`;
        // here we prove the webview→host results command is wired: after the
        // no-config in-page handback, a pushed UpdateLintResultsCommand is
        // accepted and applied (the debug log confirms the round-trip). The
        // bridge has no Problems panel, and the status slot already shows the
        // default before the push, so the log is the only observable effect.
        const { rpc, frames, editorId } = await setup({ content: BPMN_XML_OVERSIZED });

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
        const frame = await waitForFrame(frames, isLintResultsFrame, {
            timeoutMs: 5000,
            onMiss: writeConfig,
        });
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
        await waitForFrame(frames, isInPageInstructionFrame, {
            timeoutMs: 5000,
            fromIndex: baseline,
        });
    });
    async function setupHostLinted() {
        const session = await setup();
        await fs.writeFile(
            join(session.root, ".bpmnlintrc"),
            JSON.stringify({
                extends: "bpmnlint:recommended",
                moddleExtensions: { acme: "./acme.json" },
            }),
            "utf8",
        );
        await requestConfig(session.rpc, session.editorId);
        await waitForFrame(session.frames, isLintResultsFrame);
        return session;
    }

    it("re-lints a host-linted diagram after an external edit", async () => {
        const { rpc, frames, editorId } = await setupHostLinted();
        const baseline = frames.length;

        await rpc.handleLine(
            JSON.stringify({
                method: "document/didChange",
                params: { editorId, content: BPMN_XML_OVERSIZED },
            }),
        );

        const frame = await waitForFrame(frames, isLintResultsFrame, { fromIndex: baseline });
        expect(Object.keys(frame.params.message.results)).toContain("start-event-required");
    });

    it("re-lints when the host moves the config folder", async () => {
        const { rpc, frames } = await setupHostLinted();
        const baseline = frames.length;

        await rpc.handleLine(
            JSON.stringify({
                method: "settings/didChange",
                params: { settings: { configFolder: ".bpmn" } },
            }),
        );

        await expect(
            waitForFrame(frames, isLintResultsFrame, { fromIndex: baseline }),
        ).resolves.toBeDefined();
    });

    // FSEvents reports the just-written .bpmnlintrc late, and that watcher
    // re-lint would stand in for the one a toggle must trigger.
    function ignoreFileChanges(): void {
        const createWatcher = vi
            .spyOn(NodeWorkspace.prototype, "createWatcher")
            .mockReturnValue({ dispose: () => {} });
        cleanups.push(() => createWatcher.mockRestore());
    }

    it("turns host linting off and back on when the webview toggle says so", async () => {
        ignoreFileChanges();
        const { rpc, frames, editorId } = await setupHostLinted();

        const beforeOff = frames.length;
        await toggleLinting(rpc, editorId, false);
        await expect(
            waitForFrame(frames, isLintDisabledFrame, { fromIndex: beforeOff }),
        ).resolves.toMatchObject({ params: { editorId } });

        const beforeOn = frames.length;
        await toggleLinting(rpc, editorId, true);
        await expect(
            waitForFrame(frames, isLintResultsFrame, { fromIndex: beforeOn }),
        ).resolves.toMatchObject({ params: { editorId } });
    });

    it("turns host linting off and back on when the host's status widget toggles it", async () => {
        ignoreFileChanges();
        const { rpc, frames, editorId } = await setupHostLinted();
        const toggleFromHost = () =>
            rpc.handleLine(JSON.stringify({ method: "linting/toggle", params: {} }));

        const beforeOff = frames.length;
        await toggleFromHost();
        await expect(
            waitForFrame(frames, isLintChoiceReport, { fromIndex: beforeOff }),
        ).resolves.toMatchObject({ params: { enabled: false } });
        await expect(
            waitForFrame(frames, isLintDisabledFrame, { fromIndex: beforeOff }),
        ).resolves.toMatchObject({ params: { editorId } });

        const beforeOn = frames.length;
        await toggleFromHost();
        await expect(
            waitForFrame(frames, isLintChoiceReport, { fromIndex: beforeOn }),
        ).resolves.toMatchObject({ params: { enabled: true } });
        await expect(
            waitForFrame(frames, isLintResultsFrame, { fromIndex: beforeOn }),
        ).resolves.toMatchObject({ params: { editorId } });
    });

    it("shows linting off in the host's BPMNlint slot, with a click that turns it back on", async () => {
        ignoreFileChanges();
        const { rpc, frames } = await setupHostLinted();
        const beforeOff = frames.length;

        await rpc.handleLine(JSON.stringify({ method: "linting/toggle", params: {} }));
        await waitForFrame(frames, isLintDisabledFrame, { fromIndex: beforeOff });

        expect(shownLintStatus(frames, beforeOff)).toMatchObject({
            text: "BPMNlint: off",
            icon: "off",
            action: "toggleLinting",
        });
    });

    it("re-lints when the webview asks for the linting state the bridge already has", async () => {
        // A page out of step with the host's choice asks for the state the bridge already has.
        ignoreFileChanges();
        const { rpc, frames, editorId } = await setupHostLinted();

        const beforeEnable = frames.length;
        await toggleLinting(rpc, editorId, true);

        await expect(
            waitForFrame(frames, isLintResultsFrame, { fromIndex: beforeEnable }),
        ).resolves.toMatchObject({ params: { editorId } });
        expect(frames.slice(beforeEnable).find(isLintChoiceReport)).toBeUndefined();
    });

    it("reports the webview's linting choice to the host and waits for its snapshot", async () => {
        const { rpc, frames, editorId } = await setup({ hostPersistsLintChoices: false });
        await requestConfig(rpc, editorId);
        await waitForFrame(frames, isInPageInstructionFrame);
        const beforeToggle = frames.length;

        await toggleLinting(rpc, editorId, false);

        await expect(
            waitForFrame(frames, isLintChoiceReport, { fromIndex: beforeToggle }),
        ).resolves.toMatchObject({ params: { enabled: false } });
        await settle();
        expect(frames.slice(beforeToggle).find(isLintDisabledFrame)).toBeUndefined();
    });

    it("lints with the value the host registers with", async () => {
        const { rpc, frames, editorId } = await setup({ settings: { lintingEnabled: false } });

        await requestConfig(rpc, editorId);

        await expect(waitForFrame(frames, isLintDisabledFrame)).resolves.toMatchObject({
            params: { editorId },
        });
        expect(frames.find(isInPageInstructionFrame)).toBeUndefined();
    });

    it("keeps linting off for an editor of the project opened after the toggle", async () => {
        const { rpc, frames, root, editorId } = await setupHostLinted();
        const beforeToggle = frames.length;
        await toggleLinting(rpc, editorId, false);
        await waitForFrame(frames, isLintDisabledFrame, { fromIndex: beforeToggle });

        const laterPath = join(root, "later.bpmn");
        await fs.writeFile(laterPath, BPMN_XML, "utf8");
        const laterEditorId = `file://${laterPath}`;
        await rpc.handleLine(
            JSON.stringify({
                method: "session/register",
                params: registerParams(laterEditorId, root, laterPath, BPMN_XML),
            }),
        );
        const beforeRequest = frames.length;
        await requestConfig(rpc, laterEditorId);

        await expect(
            waitForFrame(
                frames,
                (frame) => isLintDisabledFrame(frame) && frame.params.editorId === laterEditorId,
                { fromIndex: beforeRequest },
            ),
        ).resolves.toBeDefined();
    });
});
