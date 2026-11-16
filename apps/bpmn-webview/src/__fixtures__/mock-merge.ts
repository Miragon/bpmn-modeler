/**
 * Recorded merge states for the dev-mode merge preview (`?mode=merge-current`
 * and `?mode=merge-incoming`), as the core would send them for a merge of the
 * diff preview's two diagrams: current is `MOCK_DIFF_BEFORE_XML`, incoming
 * `MOCK_DIFF_AFTER_XML`, and both renamed `ServiceTask_1` from a common
 * ancestor and named the process differently.
 *
 * Recorded by hand, so the webview preview needs no private merge library:
 * keep them in step with what `mergePaneView` and `mergePaneSteps` produce.
 */
import {
    ApplyMergeStatesQuery,
    type MergePaneOutcome,
    type MergePaneStates,
    type MergePaneStep,
    type MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import type { DiffSide, MergeSide } from "@miragon/bpmn-modeler-types";

const step = (
    id: string,
    onThisPane: boolean,
    shapeless = false,
    onOtherPane = true,
): MergePaneStep => ({
    id,
    shapeless,
    onThisPane,
    onOtherPane,
});

const SHAPELESS = [{ id: "Process_1", type: "bpmn:Process", marker: "conflict" }] as const;

/** Nothing picked yet: every element of the merge can be kept from either side. */
const NO_PICKS = {
    badges: [],
    picksNotDrawn: [],
    consequences: [],
    names: {},
    pickable: [
        { id: "Process_1", container: true },
        ...["ServiceTask_1", "Flow_2", "UserTask_ToRemove", "Gateway_1", "Flow_3"].map((id) => ({
            id,
            container: false,
        })),
    ],
} as const satisfies Pick<
    MergePaneStates,
    "badges" | "picksNotDrawn" | "consequences" | "pickable" | "names"
>;

const CURRENT: MergePaneStates = {
    caption: { side: "current", role: "branch", ref: "main", shortHash: "1a2b3c4" },
    marks: {
        takenFromThisSide: [],
        takenFromOtherSide: ["Flow_2", "UserTask_ToRemove", "Flow_3"],
        conflict: ["ServiceTask_1"],
    },
    shapeless: SHAPELESS,
    counts: { takenFromThisSide: 0, takenFromOtherSide: 3, conflict: 2 },
    openConflictSteps: [step("ServiceTask_1", true), step("Process_1", true, true)],
    allSteps: [
        step("ServiceTask_1", true),
        step("Flow_2", true),
        step("UserTask_ToRemove", true, false, false),
        step("Gateway_1", false),
        step("Flow_3", true),
        step("Process_1", true, true),
    ],
    openConflicts: 2,
    stepping: { list: "openConflicts" },
    ...NO_PICKS,
    build: { canBuild: false, openConflicts: 2, built: false, notes: [] },
};

const INCOMING: MergePaneStates = {
    caption: { side: "incoming", role: "upstream", ref: "feature", shortHash: "9f8e7d6" },
    marks: {
        takenFromThisSide: ["Flow_2", "Gateway_1", "Flow_3"],
        takenFromOtherSide: [],
        conflict: ["ServiceTask_1"],
    },
    shapeless: SHAPELESS,
    counts: { takenFromThisSide: 3, takenFromOtherSide: 0, conflict: 2 },
    openConflictSteps: [step("ServiceTask_1", true), step("Process_1", true, true)],
    allSteps: [
        step("ServiceTask_1", true),
        step("Flow_2", true),
        step("UserTask_ToRemove", false),
        step("Gateway_1", true, false, false),
        step("Flow_3", true),
        step("Process_1", true, true),
    ],
    openConflicts: 2,
    stepping: { list: "openConflicts" },
    ...NO_PICKS,
    build: { canBuild: false, openConflicts: 2, built: false, notes: [] },
};

/** What each pane of the preview gets once it reports ready; it offers Show XML changes. */
export const MOCK_MERGE_STATES: Readonly<Record<DiffSide, ApplyMergeStatesQuery>> = {
    before: new ApplyMergeStatesQuery("before", CURRENT, true),
    after: new ApplyMergeStatesQuery("after", INCOMING, true),
};

/**
 * Spike only: how the preview answers a pick, chosen by `?outcome=` beside
 * `?mode=merge-…`, so the outcome card can be seen without a merge library.
 * `kept` applies every pick, `refused` refuses it with four blockers,
 * `restore` applies it with the offer to keep two removed flows. With any
 * of them, the incoming pane offers "Leave out" on `ServiceTask_1`, as if
 * current had removed it.
 */
export type MockMergeOutcome = "kept" | "refused" | "restore";

export const MOCK_MERGE_OUTCOMES: readonly MockMergeOutcome[] = ["kept", "refused", "restore"];

/** The pick or undo a merge pane sent, as the preview reads it. */
export interface MockMergeDecision {
    readonly type: "PickMergeSideCommand" | "UnpickMergeCommand";
    readonly elementId: string;
    readonly scope: MergePickScope;
    readonly side?: MergeSide;
}

const OTHER: Record<MergeSide, MergeSide> = { current: "incoming", incoming: "current" };

/** The first states of a preview pane in an outcome scenario. */
export function mockMergeStatesFor(paneSide: DiffSide, outcome: MockMergeOutcome | undefined) {
    const query = MOCK_MERGE_STATES[paneSide];
    if (outcome === undefined || paneSide === "before") return query;
    return new ApplyMergeStatesQuery(
        paneSide,
        {
            ...query.states,
            pickable: query.states.pickable.map((entry) =>
                entry.id === "ServiceTask_1" ? { ...entry, removedByOtherSide: true } : entry,
            ),
        },
        query.elementXmlChanges,
    );
}

/** The states the preview answers `decision` with in the `outcome` scenario. */
export function mockMergeStatesAnswering(
    paneSide: DiffSide,
    outcome: MockMergeOutcome,
    decision: MockMergeDecision,
): ApplyMergeStatesQuery {
    const first = mockMergeStatesFor(paneSide, outcome);
    const paneMergeSide = first.states.caption.side;
    const { elementId } = decision;
    const keptSide = decision.side ?? paneMergeSide;
    const undo = decision.type === "UnpickMergeCommand";
    const action = undo ? "unpick" : keptSide === paneMergeSide ? "pick" : "leaveOut";
    const lastOutcome: MergePaneOutcome =
        outcome === "refused"
            ? {
                  applied: false,
                  action,
                  elementId,
                  blockedBy: ["Flow_2", "Flow_3", "Gateway_1", "UserTask_ToRemove"].map(
                      (blocker) => ({
                          elementId: blocker,
                          targetId: elementId,
                          obstacle: "dependentPicked",
                      }),
                  ),
              }
            : {
                  applied: true,
                  action,
                  elementId,
                  pulledIn: action === "pick" ? ["Flow_2"] : [],
                  dropped: action === "leaveOut" ? ["Flow_2", "Flow_3"] : [],
                  reopened: undo ? [elementId] : [],
              };
    const picked = !undo && lastOutcome.applied;
    const restoreOffer =
        outcome === "restore" && picked && action === "pick"
            ? { elementId, connections: ["Flow_2", "Flow_3"], removedBy: OTHER[paneMergeSide] }
            : undefined;
    return new ApplyMergeStatesQuery(
        paneSide,
        {
            ...first.states,
            badges: picked
                ? [
                      {
                          id: elementId,
                          kind: keptSide === paneMergeSide ? "keptHere" : "replacedHere",
                          keptSide,
                          scope: decision.scope,
                      },
                  ]
                : [],
            pickable: first.states.pickable.map((entry) =>
                entry.id === elementId && picked ? { ...entry, undo: decision.scope } : entry,
            ),
            lastOutcome,
            ...(restoreOffer === undefined ? {} : { restoreOffer }),
        },
        first.elementXmlChanges,
    );
}
