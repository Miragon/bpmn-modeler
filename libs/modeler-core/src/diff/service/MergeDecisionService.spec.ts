import { describe, expect, expectTypeOf, it } from "vitest";

import type {
    ContainerReach,
    ElementPick,
    LackingSide,
    MergeStep,
    PickableElement,
    PickBadge,
    PickScope,
    RequirementObstacle,
    ShapelessRow,
    ValueDifference,
} from "@miragon/bpmn-modeler-merge";
import {
    type ApplyMergeStatesQuery,
    type MergeObstacleKind,
    type MergeObstacleWithMissing,
    type MergePaneBadge,
    type MergePaneContainerReach,
    type MergePaneLackingSide,
    type MergePanePick,
    type MergePanePickable,
    type MergePaneShapelessRow,
    type MergePaneStep,
    type MergePaneValueDifference,
    type MergeHostOffers,
    type MergePickScope,
    NO_MERGE_HOST_OFFERS,
    PickMergeSideCommand,
    SHOW_ALL_CURSOR,
} from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import {
    createTestHost,
    FakeDiffPaneHandle,
    mergeSessionOf,
    ORDER_MERGE_STAGES,
    ORDER_REMOVAL_STAGES,
    ORDER_REMOVED_FLOW_STAGES,
    orderProcessXml,
    PACKING_MERGE_STAGES,
    RecordingMergeSidesView,
} from "../../testing";
import { ResolvableStages } from "../domain/conflictReading";
import { BpmnDiffService } from "./BpmnDiffService";
import { createDiffPaneRouter } from "./diffPaneRouter";
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

/** The services of one host, which a merge view of the same file opened again shares. */
function mergeHost(offers?: () => Promise<MergeHostOffers>) {
    const { notifier, settings } = createTestHost();
    const store = new DiffPaneStore();
    const sessions = new MergeSessionStore(store, new RecordingMergeSidesView());
    const decisions = new MergeDecisionService(sessions, notifier, offers);
    const diffService = new BpmnDiffService(notifier, settings, store, undefined, decisions);
    return { store, sessions, decisions, diffService };
}

/** A merge view of `stages` whose two panes are attached but not yet ready. */
async function openMergeView(
    stages: ResolvableStages = ORDER_MERGE_STAGES,
    offers?: () => Promise<MergeHostOffers>,
    host = mergeHost(offers),
) {
    const { store, sessions, diffService } = host;
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
    const pick = (
        pane: FakeDiffPaneHandle,
        elementId: string,
        scope: MergePickScope = "element",
        side?: MergeSide,
    ) => diffService.pickMergeSide(pane, elementId, scope, side);
    const unpick = (
        pane: FakeDiffPaneHandle,
        elementId: string,
        scope: MergePickScope = "element",
    ) => diffService.unpickMerge(pane, elementId, scope);
    return { host, diffService, current, incoming, bothReady, store, sessions, pick, unpick };
}

/** A second tab of the view, whose panes show the same versions under the same URIs. */
async function openAnotherTab(
    view: Awaited<ReturnType<typeof openMergeView>>,
    stages: ResolvableStages = ORDER_REMOVED_FLOW_STAGES,
) {
    const session = view.sessions.of("file:///repo/order.bpmn");
    if (!session) throw new Error("no merge view");
    const tab = view.store.registerMerge(URIS);
    view.sessions.join(session, tab);
    const current = new FakeDiffPaneHandle(URIS.current, stages.current);
    const incoming = new FakeDiffPaneHandle(URIS.incoming, stages.incoming);
    tab.attachPane(current);
    tab.attachPane(incoming);
    await view.diffService.markReady(current);
    await view.diffService.markReady(incoming);
    return { current, incoming };
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

    it("lists a shape-less conflict in the menu with both sides' values, the same on both panes", async () => {
        const { current, incoming, bothReady } = await openMergeView();

        await bothReady();

        for (const pane of [current, incoming]) {
            expect(lastStatesOf(pane).states.shapelessRows).toStrictEqual([
                {
                    id: "Process_1",
                    type: "bpmn:Process",
                    marker: "conflict",
                    container: "contents",
                    current: { name: "Order A" },
                    incoming: { name: "Order B" },
                    differences: [{ attribute: "name", current: "Order A", incoming: "Order B" }],
                },
            ]);
            expect(lastStatesOf(pane).states.names).toStrictEqual({ Process_1: "Order A" });
        }
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

    it("tells the panes what the host offers, asked again for every post", async () => {
        let offers: MergeHostOffers = { elementXmlChanges: true, elementXmlMerge: false };
        const { current, bothReady, pick } = await openMergeView(
            ORDER_MERGE_STAGES,
            async () => offers,
        );

        await bothReady();
        expect(lastStatesOf(current).offers).toStrictEqual(offers);

        offers = { elementXmlChanges: true, elementXmlMerge: true };
        await pick(current, "Task_Pack", "element", "current");
        expect(lastStatesOf(current).offers).toStrictEqual(offers);
    });

    it("offers the panes nothing on a host that names no offers", async () => {
        const { current, bothReady } = await openMergeView();

        await bothReady();

        expect(lastStatesOf(current).offers).toStrictEqual(NO_MERGE_HOST_OFFERS);
    });

    describe("a version merged by hand", () => {
        async function mergedByHand() {
            const view = await openMergeView();
            await view.bothReady();
            await view.pick(view.current, "Task_Pack", "element", "current");
            const session = view.sessions.of("file:///repo/order.bpmn");
            const texts = session?.sources.handMergeTexts.get("Task_Pack");
            if (!session || !texts) throw new Error("Task_Pack has no hand-merge texts");
            const text = texts.current.replace("Pack parcel", "Pack it");
            const outcome = await view.host.decisions.mergeByHand(session, {
                elementId: "Task_Pack",
                side: "current",
                text,
            });
            expect(outcome).toStrictEqual({ applied: true });
            return { ...view, session };
        }

        it("refuses a pick that would move it off its side and changes nothing", async () => {
            const { session, incoming, pick } = await mergedByHand();

            await pick(incoming, "Task_Pack", "element", "incoming");

            expect(session.decisions.sideOf("Task_Pack")).toBe("current");
            expect(session.decisions.handMergeOf("Task_Pack")).toBeDefined();
            expect(lastStatesOf(incoming).states.lastOutcome).toStrictEqual({
                applied: false,
                action: "pick",
                elementId: "Task_Pack",
                blockedBy: [],
                handMergesAtStake: ["Task_Pack"],
            });
        });

        it("drops it on a pick the user said may drop it", async () => {
            const { session, incoming, diffService } = await mergedByHand();

            await diffService.pickMergeSide(incoming, "Task_Pack", "element", "incoming", true);

            expect(session.decisions.sideOf("Task_Pack")).toBe("incoming");
            expect(session.decisions.handMergeOf("Task_Pack")).toBeUndefined();
            expect(lastStatesOf(incoming).states.lastOutcome).toMatchObject({ applied: true });
        });

        it("keeps it through an undo that does not drop it, and drops it on one that does", async () => {
            const { session, current, unpick, diffService } = await mergedByHand();

            await unpick(current, "Task_Pack");
            expect(session.decisions.handMergeOf("Task_Pack")).toBeDefined();

            await diffService.unpickMerge(current, "Task_Pack", "element", true);
            expect(session.decisions.handMergeOf("Task_Pack")).toBeUndefined();
            expect(session.decisions.originOf("Task_Pack")).not.toBe("picked");
        });
    });

    it("keeps the protocol's copies of the step and the shape-less row equal to the merge's", () => {
        expectTypeOf<MergePaneStep>().toEqualTypeOf<MergeStep>();
        expectTypeOf<MergePaneShapelessRow>().toEqualTypeOf<ShapelessRow>();
        expectTypeOf<MergePaneValueDifference>().toEqualTypeOf<ValueDifference>();
    });

    it("keeps the protocol's copies of the picks and the obstacles equal to the merge's", () => {
        expectTypeOf<MergePickScope>().toEqualTypeOf<PickScope>();
        expectTypeOf<MergePanePick>().toEqualTypeOf<ElementPick>();
        expectTypeOf<MergePaneLackingSide>().toEqualTypeOf<LackingSide>();
        expectTypeOf<MergePaneBadge>().toEqualTypeOf<PickBadge>();
        expectTypeOf<MergePanePickable>().toEqualTypeOf<PickableElement>();
        expectTypeOf<MergePaneContainerReach>().toEqualTypeOf<ContainerReach>();
        expectTypeOf<MergeObstacleKind>().toEqualTypeOf<RequirementObstacle["kind"]>();
        expectTypeOf<MergeObstacleWithMissing>().toEqualTypeOf<
            Extract<RequirementObstacle, { missing: unknown }>["kind"]
        >();
    });

    describe("picks", () => {
        it("marks a picked element kept on its pane and replaced on the other, and lowers the open count", async () => {
            const { current, incoming, bothReady, pick } = await openMergeView();
            await bothReady();

            await pick(incoming, "Task_Pack");

            const incomingStates = lastStatesOf(incoming).states;
            const currentStates = lastStatesOf(current).states;
            expect(incomingStates.marks.takenFromThisSide).toContain("Task_Pack");
            expect(currentStates.marks.takenFromOtherSide).toContain("Task_Pack");
            expect(incomingStates.badges).toStrictEqual([
                {
                    id: "Task_Pack",
                    kind: "keptHere",
                    pick: { keptSide: "incoming", scope: "element" },
                },
            ]);
            expect(currentStates.badges).toStrictEqual([
                {
                    id: "Task_Pack",
                    kind: "replacedHere",
                    pick: { keptSide: "incoming", scope: "element" },
                },
            ]);
            expect(incomingStates.openConflicts).toBe(1);
            expect(currentStates.openConflicts).toBe(1);
            expect(incomingStates.pickable).toContainEqual({
                id: "Task_Pack",
                takenSide: "incoming",
                pick: { keptSide: "incoming", scope: "element" },
                handMergeable: true,
            });
            expect(incomingStates.lastOutcome).toStrictEqual({
                applied: true,
                action: "pick",
                elementId: "Task_Pack",
                pulledIn: [],
                dropped: [],
                reopened: [],
            });
        });

        it("decides every conflict inside a sub-process kept with its contents", async () => {
            const { current, incoming, bothReady, pick } =
                await openMergeView(PACKING_MERGE_STAGES);
            await bothReady();
            expect(lastStatesOf(current).states.openConflicts).toBe(2);

            await pick(current, "Sub_Packing", "withContents");

            const { states } = lastStatesOf(incoming);
            expect(states.openConflicts).toBe(0);
            expect(states.badges.map(({ id, pick }) => [id, pick.scope])).toStrictEqual([
                ["Sub_Packing", "withContents"],
                ["Task_Wrap", "element"],
                ["Task_Label", "element"],
            ]);
            expect(states.pickable).toContainEqual({
                id: "Sub_Packing",
                container: "contents",
                pick: { keptSide: "current", scope: "withContents" },
            });
        });

        it("refuses a blocked pick and tells the pane which element blocks it, changing nothing", async () => {
            const { current, incoming, bothReady, pick } =
                await openMergeView(ORDER_REMOVED_FLOW_STAGES);
            await bothReady();
            await pick(incoming, "Flow_2");
            const marksBefore = lastStatesOf(current).states.marks;

            await pick(current, "Task_Pack");

            const { states } = lastStatesOf(current);
            expect(states.lastOutcome).toStrictEqual({
                applied: false,
                action: "leaveOut",
                elementId: "Task_Pack",
                blockedBy: [
                    { elementId: "Flow_2", targetId: "Task_Pack", obstacle: "dependentPicked" },
                ],
            });
            expect(states.marks).toStrictEqual(marksBefore);
            expect(lastStatesOf(incoming).states.lastOutcome?.applied).toBe(false);
        });

        describe("an undo that frees the pane's refused decision", () => {
            async function refusedLeaveOut() {
                const view = await openMergeView(ORDER_REMOVED_FLOW_STAGES);
                await view.bothReady();
                await view.pick(view.current, "Flow_2", "element", "incoming");
                await view.pick(view.current, "Task_Pack");
                expect(lastStatesOf(view.current).states.lastOutcome?.applied).toBe(false);
                return view;
            }

            const freedOf = (pane: FakeDiffPaneHandle) => {
                const outcome = lastStatesOf(pane).states.lastOutcome;
                return outcome?.applied ? outcome.freed : undefined;
            };

            it("names the refused decision once the merge would apply it, on both panes' outcome", async () => {
                const { current, incoming, unpick } = await refusedLeaveOut();

                await unpick(current, "Flow_2");

                expect(freedOf(current)).toStrictEqual({
                    action: "leaveOut",
                    elementId: "Task_Pack",
                });
                expect(freedOf(incoming)).toStrictEqual(freedOf(current));
            });

            it("names none while a pick the pane made after the refusal still blocks it", async () => {
                const { current, pick, unpick } = await refusedLeaveOut();
                await pick(current, "Flow_3", "element", "incoming");

                await unpick(current, "Flow_2");
                expect(freedOf(current)).toBeUndefined();
                await unpick(current, "Flow_3");

                expect(freedOf(current)).toStrictEqual({
                    action: "leaveOut",
                    elementId: "Task_Pack",
                });
            });

            it("names it only once", async () => {
                const { current, pick, unpick } = await refusedLeaveOut();
                await unpick(current, "Flow_2");
                await pick(current, "Flow_2", "element", "incoming");

                await unpick(current, "Flow_2");

                expect(freedOf(current)).toBeUndefined();
            });

            it("forgets the refusal on a decision of the same side in another tab of the view", async () => {
                const view = await refusedLeaveOut();
                const otherTab = await openAnotherTab(view);

                await view.unpick(otherTab.current, "Flow_2");
                expect(freedOf(otherTab.current)).toBeUndefined();
                await view.pick(view.current, "Flow_2", "element", "incoming");
                await view.unpick(view.current, "Flow_2");

                expect(freedOf(view.current)).toBeUndefined();
            });

            it("keeps the refusal through the finish of a merge editor, which changes no pick", async () => {
                const view = await refusedLeaveOut();
                const session = view.sessions.of("file:///repo/order.bpmn");
                if (!session) throw new Error("no merge view");

                await view.host.decisions.discardHandMerge(session, "Flow_2");
                await view.unpick(view.current, "Flow_2");

                expect(freedOf(view.current)).toStrictEqual({
                    action: "leaveOut",
                    elementId: "Task_Pack",
                });
            });

            it("leaves the partner's refusal to the partner, which forgets it on the newer decision", async () => {
                const { current, incoming, pick, unpick } = await refusedLeaveOut();

                await unpick(incoming, "Flow_2");
                expect(freedOf(incoming)).toBeUndefined();
                await pick(current, "Flow_2", "element", "incoming");
                await unpick(current, "Flow_2");

                expect(freedOf(current)).toBeUndefined();
            });
        });

        it("names what a pick pulled in, dropped and reopened", async () => {
            const { current, incoming, bothReady, pick } =
                await openMergeView(ORDER_REMOVED_FLOW_STAGES);
            await bothReady();

            await pick(incoming, "Flow_2");

            expect(lastStatesOf(current).states.lastOutcome).toStrictEqual({
                applied: true,
                action: "pick",
                elementId: "Flow_2",
                pulledIn: ["Task_Pack"],
                dropped: [],
                reopened: [],
            });
            expect(lastStatesOf(incoming).states.consequences).toStrictEqual(["Task_Pack"]);
            expect(lastStatesOf(incoming).states.badges.map(({ id }) => id)).toStrictEqual([
                "Flow_2",
            ]);
        });

        it("reverts a pick", async () => {
            const { current, incoming, bothReady, pick, unpick } = await openMergeView();
            await bothReady();
            const marksBefore = lastStatesOf(current).states.marks;
            await pick(incoming, "Task_Pack");

            await unpick(current, "Task_Pack");

            const { states } = lastStatesOf(current);
            expect(states.marks).toStrictEqual(marksBefore);
            expect(states.badges).toStrictEqual([]);
            expect(states.openConflicts).toBe(2);
            expect(states.lastOutcome).toMatchObject({
                applied: true,
                action: "unpick",
                elementId: "Task_Pack",
                reopened: ["Task_Pack"],
            });
            expect(lastStatesOf(incoming).states.badges).toStrictEqual([]);
        });

        it("overrides an automatic resolution", async () => {
            const { current, incoming, bothReady, pick } = await openMergeView();
            await bothReady();
            expect(lastStatesOf(current).states.marks.takenFromThisSide).toContain("Task_Check");

            await pick(incoming, "Task_Check");

            expect(lastStatesOf(incoming).states.marks.takenFromThisSide).toContain("Task_Check");
            expect(lastStatesOf(current).states.badges).toStrictEqual([
                {
                    id: "Task_Check",
                    kind: "replacedHere",
                    pick: { keptSide: "incoming", scope: "element" },
                },
            ]);
        });

        it("offers the flows the other side removed with a kept element and keeps them on request", async () => {
            const { current, incoming, bothReady, pick } =
                await openMergeView(ORDER_REMOVAL_STAGES);
            await bothReady();

            await pick(incoming, "Task_Pack");

            expect(lastStatesOf(incoming).states.restoreOffer).toStrictEqual({
                elementId: "Task_Pack",
                connections: ["Flow_2", "Flow_3"],
                removedBy: "current",
            });
            expect(lastStatesOf(current).states.restoreOffer).toBeUndefined();

            await pick(incoming, "Task_Pack", "withRemoved");

            const { states } = lastStatesOf(incoming);
            expect(states.restoreOffer).toBeUndefined();
            expect(states.badges.map(({ id, pick }) => [id, pick.scope])).toStrictEqual([
                ["Task_Pack", "withRemoved"],
                ["Flow_2", "element"],
                ["Flow_3", "element"],
            ]);
        });

        it.each([
            ["closed without a save", "discarded"],
            ["refused", "refused"],
        ] as const)(
            "keeps a pick's restore offer through a hand merge %s",
            async (_case, finish) => {
                const { host, incoming, bothReady, pick, sessions } =
                    await openMergeView(ORDER_REMOVAL_STAGES);
                await bothReady();
                await pick(incoming, "Task_Pack");
                const offered = lastStatesOf(incoming).states.restoreOffer;
                expect(offered).toBeDefined();
                const session = sessions.of("file:///repo/order.bpmn");
                if (!session) throw new Error("no merge view");

                if (finish === "discarded") {
                    await host.decisions.discardHandMerge(session, "Task_Pack");
                } else {
                    await host.decisions.mergeByHand(session, {
                        elementId: "Task_Pack",
                        side: "incoming",
                        text: "<<<<<<< current",
                    });
                }

                const { states } = lastStatesOf(incoming);
                expect(states.lastOutcome).toMatchObject({ action: "mergeByHand", applied: false });
                expect(states.restoreOffer).toStrictEqual(offered);
            },
        );

        it("takes back an element with the flows kept with it", async () => {
            const { current, incoming, bothReady, pick, unpick } =
                await openMergeView(ORDER_REMOVAL_STAGES);
            await bothReady();
            await pick(incoming, "Task_Pack", "withRemoved");

            await unpick(current, "Task_Pack", "withRemoved");

            expect(lastStatesOf(incoming).states.badges).toStrictEqual([]);
            expect(lastStatesOf(incoming).states.consequences).toStrictEqual([]);
        });

        it("carries a pick the pane cannot draw in pickable, without a badge", async () => {
            const { current, incoming, bothReady, pick } =
                await openMergeView(ORDER_REMOVAL_STAGES);
            await bothReady();

            await pick(incoming, "Task_Pack");

            const { states } = lastStatesOf(current);
            expect(states.pickable.find(({ id }) => id === "Task_Pack")?.pick).toStrictEqual({
                keptSide: "incoming",
                scope: "element",
            });
            expect(states.badges).toStrictEqual([]);
        });

        it("sends the last outcome and the restore offer again when a pane reloads", async () => {
            const { diffService, incoming, bothReady, pick } =
                await openMergeView(ORDER_REMOVAL_STAGES);
            await bothReady();
            await pick(incoming, "Task_Pack");
            const before = lastStatesOf(incoming);
            incoming.posted.length = 0;

            await diffService.markReady(incoming);

            expect(lastStatesOf(incoming)).toStrictEqual(before);
            expect(lastStatesOf(incoming).states.restoreOffer).toBeDefined();
        });

        it("forgets the picks and what they did when the session closes", async () => {
            const { host, current, incoming, bothReady, pick, store, sessions } =
                await openMergeView(ORDER_REMOVAL_STAGES);
            await bothReady();
            await pick(incoming, "Task_Pack");
            expect(lastStatesOf(current).states.pickable.some(({ pick }) => pick)).toBe(true);

            store.detach(current);
            store.detach(incoming);

            expect(sessions.of("file:///repo/order.bpmn")).toBeUndefined();
            const reopened = await openMergeView(ORDER_REMOVAL_STAGES, undefined, host);
            await reopened.bothReady();
            for (const pane of [reopened.current, reopened.incoming]) {
                const { states } = lastStatesOf(pane);
                expect(states.badges).toStrictEqual([]);
                expect(states.pickable.filter(({ pick }) => pick)).toStrictEqual([]);
                expect(states.lastOutcome).toBeUndefined();
                expect(states.restoreOffer).toBeUndefined();
            }
        });

        it("calls a pick from the side that removed an element leaving it out", async () => {
            const { current, incoming, bothReady, pick } =
                await openMergeView(ORDER_REMOVAL_STAGES);
            await bothReady();

            await pick(current, "Task_Pack");

            expect(lastStatesOf(incoming).states.lastOutcome).toMatchObject({
                applied: true,
                action: "leaveOut",
                elementId: "Task_Pack",
            });
        });

        it.each([
            ["current", "incoming"],
            ["incoming", "current"],
        ] as const)(
            "keeps an element from the side the pick names, sent from the %s pane",
            async (sender, namedSide) => {
                const mergeView = await openMergeView();
                await mergeView.bothReady();
                const router = createDiffPaneRouter(mergeView.diffService, {});

                await router.dispatch(
                    new PickMergeSideCommand("Task_Pack", "element", namedSide),
                    mergeView[sender],
                );

                expect(lastStatesOf(mergeView[namedSide]).states.badges).toStrictEqual([
                    {
                        id: "Task_Pack",
                        kind: "keptHere",
                        pick: { keptSide: namedSide, scope: "element" },
                    },
                ]);
                for (const pane of [mergeView.current, mergeView.incoming]) {
                    expect(lastStatesOf(pane).states.lastOutcome).toMatchObject({
                        applied: true,
                        action: "pick",
                        elementId: "Task_Pack",
                    });
                }
            },
        );

        it("leaves an element out when the pick names the side that removed it, sent from the pane that draws it", async () => {
            const { incoming, bothReady, pick } = await openMergeView(ORDER_REMOVAL_STAGES);
            await bothReady();

            await pick(incoming, "Task_Pack", "element", "current");

            expect(lastStatesOf(incoming).states.lastOutcome).toMatchObject({
                applied: true,
                action: "leaveOut",
                elementId: "Task_Pack",
            });
        });

        it("leaves an element out when the pick names the side that never had it, without an ancestor", async () => {
            const { current, bothReady, pick } = await openMergeView({
                current: orderProcessXml(),
                incoming: orderProcessXml({ withoutPack: true }),
            });
            await bothReady();

            await pick(current, "Task_Pack", "element", "incoming");

            expect(lastStatesOf(current).states.lastOutcome).toMatchObject({
                applied: true,
                action: "leaveOut",
                elementId: "Task_Pack",
            });
        });

        it("offers the removed flows on the pane of the side the pick names, not the sender's", async () => {
            const { current, incoming, bothReady, pick } =
                await openMergeView(ORDER_REMOVAL_STAGES);
            await bothReady();

            await pick(current, "Task_Pack", "element", "incoming");

            expect(lastStatesOf(incoming).states.restoreOffer).toStrictEqual({
                elementId: "Task_Pack",
                connections: ["Flow_2", "Flow_3"],
                removedBy: "current",
            });
            expect(lastStatesOf(current).states.restoreOffer).toBeUndefined();
        });

        it("offers the removed flows of an element no canvas draws on both panes, so the pane with the menu can keep them", async () => {
            const withoutPackShape = (xml: string) =>
                xml.replace(
                    / *<bpmndi:BPMNShape id="Task_Pack_di"[\s\S]*?<\/bpmndi:BPMNShape>\n/,
                    "",
                );
            const { current, incoming, bothReady, pick } = await openMergeView({
                base: withoutPackShape(orderProcessXml()),
                current: withoutPackShape(orderProcessXml({ check: "Check order" })),
                incoming: orderProcessXml({ withoutPack: true }),
            });
            await bothReady();

            await pick(incoming, "Task_Pack", "element", "current");

            for (const pane of [current, incoming]) {
                expect(lastStatesOf(pane).states.restoreOffer).toStrictEqual({
                    elementId: "Task_Pack",
                    connections: ["Flow_2", "Flow_3"],
                    removedBy: "incoming",
                });
            }
        });

        it("tells both panes which side lacks an element, and why", async () => {
            const { current, incoming, bothReady } = await openMergeView(ORDER_REMOVAL_STAGES);

            await bothReady();

            for (const pane of [current, incoming]) {
                expect(lastStatesOf(pane).states.pickable).toContainEqual({
                    id: "Task_Pack",
                    takenSide: "current",
                    lackingSide: { side: "current", lack: "removed" },
                });
            }
        });

        it("ignores an Undo of an element no longer picked, keeping what the last pick did", async () => {
            const { diffService, current, incoming, bothReady, pick, unpick } =
                await openMergeView(ORDER_REMOVAL_STAGES);
            await bothReady();
            await pick(incoming, "Task_Pack");
            const before = lastStatesOf(incoming);
            current.posted.length = 0;
            incoming.posted.length = 0;

            await unpick(current, "Task_Check");

            expect(statesOf(current)).toStrictEqual([]);
            expect(statesOf(incoming)).toStrictEqual([]);
            await diffService.markReady(incoming);
            expect(lastStatesOf(incoming)).toStrictEqual(before);
        });

        it("names the elements the legend names as the side the merge takes them from, the same on both panes", async () => {
            const { current, incoming, bothReady, pick } = await openMergeView();
            await bothReady();

            await pick(current, "Process_1");
            for (const pane of [current, incoming]) {
                expect(lastStatesOf(pane).states.names).toStrictEqual({ Process_1: "Order A" });
            }

            await pick(incoming, "Process_1");
            for (const pane of [current, incoming]) {
                expect(lastStatesOf(pane).states.names).toStrictEqual({ Process_1: "Order B" });
            }
        });

        it("ignores a pick from a pane of no merge view", async () => {
            const { pick } = await openMergeView();
            const stray = new FakeDiffPaneHandle("file:///repo/other.bpmn", "");

            await pick(stray, "Task_Pack");

            expect(stray.posted).toStrictEqual([]);
        });
    });
});
