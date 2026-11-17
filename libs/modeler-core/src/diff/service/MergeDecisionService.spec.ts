import { describe, expect, expectTypeOf, it } from "vitest";

import type { MergeStep, ShapelessMark } from "@miragon/bpmn-modeler-merge";
import {
    type ApplyMergeStatesQuery,
    type MergePaneShapelessMark,
    type MergePaneStep,
    SHOW_ALL_CURSOR,
} from "@miragon/bpmn-modeler-shared";

import {
    createTestHost,
    FakeDiffPaneHandle,
    mergeSessionOf,
    ORDER_MERGE_STAGES,
    RecordingMergeSidesView,
} from "../../testing";
import { ResolvableStages } from "../domain/conflictReading";
import { BpmnDiffService, ElementXmlChanges } from "./BpmnDiffService";
import { DiffPaneStore } from "./DiffPaneStore";
import { MergeDecisionService } from "./MergeDecisionService";
import { MergeSessionStore } from "./MergeSessionStore";

const URIS = {
    current: "bpmn-merge:/repo/order.current.bpmn?side%3Dcurrent%26opening%3D1",
    incoming: "bpmn-merge:/repo/order.incoming.bpmn?side%3Dincoming%26opening%3D1",
};

const CAPTIONS = {
    current: { side: "current", role: "branch", ref: "main" },
    incoming: { side: "incoming", role: "upstream", ref: "feature" },
} as const;

/** A merge view of `stages` whose two panes are attached but not yet ready. */
async function openMergeView(
    stages: ResolvableStages = ORDER_MERGE_STAGES,
    elementXml?: ElementXmlChanges,
) {
    const { notifier, settings } = createTestHost();
    const store = new DiffPaneStore();
    const sessions = new MergeSessionStore(store, new RecordingMergeSidesView());
    const diffService = new BpmnDiffService(
        notifier,
        settings,
        store,
        elementXml,
        new MergeDecisionService(sessions, notifier),
    );
    const diffSession = store.registerMerge(URIS);
    sessions.add(
        await mergeSessionOf({
            fileUri: "file:///repo/order.bpmn",
            fileName: "order.bpmn",
            title: "order.bpmn (Merge: main ↔ feature)",
            captions: CAPTIONS,
            uris: URIS,
            stages,
        }),
        diffSession,
    );
    const current = new FakeDiffPaneHandle(URIS.current, stages.current);
    const incoming = new FakeDiffPaneHandle(URIS.incoming, stages.incoming);
    diffSession.attachPane(current);
    diffSession.attachPane(incoming);
    const bothReady = async () => {
        await diffService.markReady(current);
        await diffService.markReady(incoming);
    };
    return { diffService, current, incoming, bothReady, store };
}

function statesOf(pane: FakeDiffPaneHandle): ApplyMergeStatesQuery[] {
    return pane.posted.filter(
        (message): message is ApplyMergeStatesQuery =>
            (message as { type: string }).type === "ApplyMergeStatesQuery",
    );
}

function lastStatesOf(pane: FakeDiffPaneHandle): ApplyMergeStatesQuery {
    const states = statesOf(pane);
    expect(states.length).toBeGreaterThan(0);
    return states[states.length - 1];
}

const ids = (steps: readonly MergePaneStep[]) => steps.map(({ id }) => id);

describe("MergeDecisionService", () => {
    it("sends each pane the marks of the elements on its canvas once both are ready", async () => {
        const { diffService, current, incoming } = await openMergeView();

        await diffService.markReady(current);
        expect(statesOf(current)).toStrictEqual([]);
        await diffService.markReady(incoming);

        expect(lastStatesOf(current)).toMatchObject({
            side: "before",
            states: {
                caption: CAPTIONS.current,
                marks: {
                    takenFromThisSide: ["Task_Check"],
                    takenFromOtherSide: [],
                    conflict: ["Task_Pack"],
                },
            },
        });
        expect(lastStatesOf(incoming)).toMatchObject({
            side: "after",
            states: {
                caption: CAPTIONS.incoming,
                marks: {
                    takenFromThisSide: [],
                    takenFromOtherSide: ["Task_Check"],
                    conflict: ["Task_Pack"],
                },
            },
        });
    });

    it("sends both panes the same step orders and the open count", async () => {
        const { current, incoming, bothReady } = await openMergeView();

        await bothReady();

        for (const pane of [current, incoming]) {
            const { states } = lastStatesOf(pane);
            expect(ids(states.openConflictSteps)).toStrictEqual(["Task_Pack", "Process_1"]);
            expect(ids(states.allSteps)).toStrictEqual(["Task_Check", "Task_Pack", "Process_1"]);
            expect(states.openConflicts).toBe(2);
        }
    });

    it("marks every content difference as a conflict without an ancestor", async () => {
        const { current, incoming, bothReady } = await openMergeView({
            current: ORDER_MERGE_STAGES.current,
            incoming: ORDER_MERGE_STAGES.incoming,
        });

        await bothReady();

        for (const pane of [current, incoming]) {
            expect(lastStatesOf(pane).states.marks).toStrictEqual({
                takenFromThisSide: [],
                takenFromOtherSide: [],
                conflict: ["Task_Check", "Task_Pack"],
            });
        }
    });

    it("counts each pane's markers, a conflict without a shape included", async () => {
        const { current, incoming, bothReady } = await openMergeView();

        await bothReady();

        expect(lastStatesOf(current).states.counts).toStrictEqual({
            takenFromThisSide: 1,
            takenFromOtherSide: 0,
            conflict: 2,
        });
        expect(lastStatesOf(incoming).states.counts).toStrictEqual({
            takenFromThisSide: 0,
            takenFromOtherSide: 1,
            conflict: 2,
        });
    });

    it("lists a conflict on the process's own attributes as shape-less", async () => {
        const { current, bothReady } = await openMergeView();

        await bothReady();

        expect(lastStatesOf(current).states.shapeless).toStrictEqual([
            { id: "Process_1", type: "bpmn:Process", marker: "conflict" },
        ]);
    });

    it("sends the full state again when a pane reloads", async () => {
        const { diffService, current, incoming, bothReady } = await openMergeView();
        await bothReady();
        const first = lastStatesOf(incoming);
        current.posted.length = 0;
        incoming.posted.length = 0;

        await diffService.markReady(incoming);

        expect(statesOf(incoming)).toHaveLength(1);
        expect(lastStatesOf(incoming)).toStrictEqual(first);
        expect(statesOf(current)).toHaveLength(1);
    });

    it("starts both panes on the open conflicts, on no step", async () => {
        const { current, incoming, bothReady } = await openMergeView();

        await bothReady();

        for (const pane of [current, incoming]) {
            expect(lastStatesOf(pane).states.stepping).toStrictEqual({ list: "openConflicts" });
        }
    });

    it("sends both panes the list one of them chose to step through", async () => {
        const { diffService, current, incoming, bothReady } = await openMergeView();
        await bothReady();

        await diffService.chooseMergeStepList(current, "all");

        for (const pane of [current, incoming]) {
            expect(lastStatesOf(pane).states.stepping).toStrictEqual({ list: "all" });
        }
    });

    it("keeps the step the panes are on for a pane that reloads, until Show all", async () => {
        const { diffService, current, incoming, bothReady } = await openMergeView();
        await bothReady();

        await diffService.forwardCursor(current, 1);
        await diffService.markReady(incoming);
        expect(lastStatesOf(incoming).states.stepping).toStrictEqual({
            list: "openConflicts",
            cursor: "Task_Pack",
        });

        await diffService.forwardCursor(incoming, SHOW_ALL_CURSOR);
        await diffService.markReady(current);
        expect(lastStatesOf(current).states.stepping).toStrictEqual({ list: "openConflicts" });
    });

    it("tells the panes whether the host shows an element's XML changes", async () => {
        const { current, bothReady } = await openMergeView(ORDER_MERGE_STAGES, {
            show: async () => undefined,
            follow: async () => undefined,
        });

        await bothReady();

        expect(lastStatesOf(current).elementXmlChanges).toBe(true);
    });

    it("keeps the protocol's copies of the step and the shape-less mark equal to the merge's", () => {
        expectTypeOf<MergePaneStep>().toEqualTypeOf<MergeStep>();
        expectTypeOf<MergePaneShapelessMark>().toEqualTypeOf<ShapelessMark>();
    });
});
