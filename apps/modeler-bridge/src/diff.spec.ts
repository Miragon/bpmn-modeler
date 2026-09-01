import { describe, expect, it, vi } from "vitest";

import { createBridge } from "./bridge";
import { Rpc } from "./rpc";

/**
 * Drives the **diff** half of the bridge end-to-end: the real diff brain
 * (`DiffPaneStore` + `BpmnDiffService` + `bpmn-js-differ`) over a captured-frame
 * fake transport, exactly like `server.spec.ts` does for the editor path. No
 * process, no JCEF — just the host-originated `diff/*` protocol and the frames
 * it produces.
 */

/** Base diagram: one task. `before` side of every diff here. */
const ONE_TASK = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.20.0">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="First" />
  </bpmn:process>
</bpmn:definitions>`;

/** `after` side: adds `Task_2`, so the differ reports exactly one `_added`. */
const TWO_TASKS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.20.0">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="First" />
    <bpmn:task id="Task_2" name="Second" />
  </bpmn:process>
</bpmn:definitions>`;

/** Spins past pending microtasks/timers so the service's async dispatch settles. */
async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function setup(): { rpc: Rpc; frames: any[] } {
    const frames: any[] = [];
    const { rpc } = createBridge((line) => frames.push(JSON.parse(line)));
    return { rpc, frames };
}

function line(method: string, params: unknown): string {
    return JSON.stringify({ method, params });
}

/** All `diff/postMessage` frames sent to a given pane, in order. */
function postsTo(frames: any[], paneUri: string): any[] {
    return frames
        .filter((f) => f.method === "diff/postMessage" && f.params.paneUri === paneUri)
        .map((f) => f.params.message);
}

describe("bridge diff (real diff brain over a fake transport)", () => {
    const BEFORE = "file:///proc.bpmn#d1-before";
    const AFTER = "file:///proc.bpmn#d1-after";

    /** Opens a compare-files diff and walks both panes to ready. */
    async function openAndReady(rpc: Rpc, frames: any[]): Promise<void> {
        await rpc.handleLine(
            line("diff/open", {
                diffId: "d1",
                origin: "compare-files",
                before: { uri: BEFORE, content: ONE_TASK },
                after: { uri: AFTER, content: TWO_TASKS },
            }),
        );
        for (const paneUri of [BEFORE, AFTER]) {
            await rpc.handleLine(
                line("diff/webviewMessage", { paneUri, message: { type: "GetBpmnFileCommand" } }),
            );
        }
        await vi.waitFor(
            () => {
                expect(postsTo(frames, BEFORE).some((m) => m.type === "BpmnFileQuery")).toBe(true);
                expect(postsTo(frames, AFTER).some((m) => m.type === "BpmnFileQuery")).toBe(true);
            },
            { timeout: 5000 },
        );
        for (const paneUri of [BEFORE, AFTER]) {
            await rpc.handleLine(
                line("diff/webviewMessage", { paneUri, message: { type: "DiffReadyCommand" } }),
            );
        }
        await vi.waitFor(
            () => {
                expect(
                    postsTo(frames, BEFORE).some((m) => m.type === "ApplyDiffHighlightsQuery"),
                ).toBe(true);
                expect(
                    postsTo(frames, AFTER).some((m) => m.type === "ApplyDiffHighlightsQuery"),
                ).toBe(true);
            },
            { timeout: 5000 },
        );
    }

    it("answers each pane's GetBpmnFileCommand with its own viewer-mode XML", async () => {
        const { rpc, frames } = setup();
        await openAndReady(rpc, frames);

        const beforeFile = postsTo(frames, BEFORE).find((m) => m.type === "BpmnFileQuery");
        const afterFile = postsTo(frames, AFTER).find((m) => m.type === "BpmnFileQuery");
        expect(beforeFile).toMatchObject({ viewerMode: "viewer", content: ONE_TASK });
        expect(afterFile).toMatchObject({ viewerMode: "viewer", content: TWO_TASKS });
    });

    it("runs the differ once both sides are ready and highlights each side", async () => {
        const { rpc, frames } = setup();
        await openAndReady(rpc, frames);

        const beforeHi = postsTo(frames, BEFORE).find((m) => m.type === "ApplyDiffHighlightsQuery");
        const afterHi = postsTo(frames, AFTER).find((m) => m.type === "ApplyDiffHighlightsQuery");

        // The added Task_2 belongs only on the after canvas; nothing was removed.
        expect(afterHi).toMatchObject({ side: "after", added: ["Task_2"], removed: [] });
        expect(beforeHi).toMatchObject({ side: "before", added: [], removed: [] });
        // Both sides see the same counts (one addition).
        expect(afterHi.counts).toMatchObject({ added: 1, removed: 0 });
        expect(beforeHi.counts).toMatchObject({ added: 1, removed: 0 });
    });

    it("forwards viewport and cursor changes to the partner pane only", async () => {
        const { rpc, frames } = setup();
        await openAndReady(rpc, frames);
        const baseline = frames.length;

        await rpc.handleLine(
            line("diff/webviewMessage", {
                paneUri: BEFORE,
                message: {
                    type: "ViewportChangedCommand",
                    viewport: { x: 1, y: 2, width: 3, height: 4 },
                },
            }),
        );
        await rpc.handleLine(
            line("diff/webviewMessage", {
                paneUri: BEFORE,
                message: { type: "CursorChangedCommand", index: 5 },
            }),
        );
        await settle();

        const fresh = frames.slice(baseline);
        const sync = fresh.filter((f) => f.method === "diff/postMessage");
        // Both sync queries target the partner (after), never the originator.
        expect(sync.every((f) => f.params.paneUri === AFTER)).toBe(true);
        expect(sync.map((f) => f.params.message.type)).toEqual([
            "SyncViewportQuery",
            "SyncCursorQuery",
        ]);
        expect(sync[0].params.message.viewport).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
        expect(sync[1].params.message.index).toBe(5);
    });

    it("disposes both panes, after which stray pane messages are no-ops", async () => {
        const { rpc, frames } = setup();
        await openAndReady(rpc, frames);

        await rpc.handleLine(line("diff/dispose", { diffId: "d1" }));
        const baseline = frames.length;

        await rpc.handleLine(
            line("diff/webviewMessage", {
                paneUri: BEFORE,
                message: { type: "GetBpmnFileCommand" },
            }),
        );
        await settle();
        expect(frames.length).toBe(baseline);
    });

    it("keeps two diffs of the same file independent (stable pane identity)", async () => {
        const { rpc, frames } = setup();

        // Same underlying file, but the host scopes each pane URI with the diff id,
        // so the two diffs never share a routing key.
        await rpc.handleLine(
            line("diff/open", {
                diffId: "dA",
                origin: "compare-files",
                before: { uri: "file:///x.bpmn#dA-before", content: ONE_TASK },
                after: { uri: "file:///x.bpmn#dA-after", content: TWO_TASKS },
            }),
        );
        await rpc.handleLine(
            line("diff/open", {
                diffId: "dB",
                origin: "compare-files",
                before: { uri: "file:///x.bpmn#dB-before", content: TWO_TASKS },
                after: { uri: "file:///x.bpmn#dB-after", content: ONE_TASK },
            }),
        );
        await rpc.handleLine(
            line("diff/webviewMessage", {
                paneUri: "file:///x.bpmn#dB-before",
                message: { type: "GetBpmnFileCommand" },
            }),
        );
        await settle();

        // Diff B's before pane must answer with B's content, not A's.
        const reply = postsTo(frames, "file:///x.bpmn#dB-before").find(
            (m) => m.type === "BpmnFileQuery",
        );
        expect(reply.content).toBe(TWO_TASKS);
        // Diff A's panes stayed silent — no cross-diff leakage.
        expect(postsTo(frames, "file:///x.bpmn#dA-before")).toHaveLength(0);
    });
});
