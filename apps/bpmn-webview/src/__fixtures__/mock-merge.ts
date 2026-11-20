/**
 * Recorded merge states for the dev-mode merge preview (`?mode=merge-current`
 * and `?mode=merge-incoming`), as the core would send them for a merge of the
 * diff preview's two diagrams: current is `MOCK_DIFF_BEFORE_XML`, incoming
 * `MOCK_DIFF_AFTER_XML`, and both renamed `ServiceTask_1` from a common
 * ancestor and named the process differently.
 *
 * Recorded by hand, so the webview preview needs no private merge library:
 * keep them in step with what `mergePaneView` and `mergePaneSteps` produce.
 *
 * `&mergeXml=accept` or `&mergeXml=refuse` starts both panes with
 * `ServiceTask_1` kept from incoming and offers Merge XML on it; the preview
 * host answers the pad's Merge XML as the merge would, taking the text or
 * refusing a changed type.
 */
import {
    ApplyMergeStatesQuery,
    type MergePaneStates,
    type MergePaneStep,
} from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

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

const SHAPELESS_ROWS = [
    {
        id: "Process_1",
        type: "bpmn:Process",
        marker: "conflict",
        container: "contents",
        current: { name: "Order process" },
        incoming: { name: "Customer order process" },
        differences: [
            { attribute: "name", current: "Order process", incoming: "Customer order process" },
        ],
    },
] as const;

/** Nothing picked yet: every element of the merge can be kept from either side. */
const noPicks = () =>
    ({
        badges: [],
        picksNotDrawn: [],
        consequences: [],
        names: {},
        pickable: [
            { id: "Process_1", container: "contents" },
            { id: "ServiceTask_1" },
            ...["Flow_2", "UserTask_ToRemove", "Gateway_1", "Flow_3"].map((id) => ({
                id,
                takenSide: "incoming" as const,
            })),
        ],
    }) as const satisfies Pick<
        MergePaneStates,
        "badges" | "picksNotDrawn" | "consequences" | "pickable" | "names"
    >;

const current = (): MergePaneStates => ({
    caption: { side: "current", role: "branch", ref: "main", shortHash: "1a2b3c4" },
    marks: {
        takenFromThisSide: [],
        takenFromOtherSide: ["Flow_2", "UserTask_ToRemove", "Flow_3"],
        conflict: ["ServiceTask_1"],
    },
    shapelessRows: SHAPELESS_ROWS,
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
    ...noPicks(),
    build: { canBuild: false, openConflicts: 2, built: false, notes: [] },
});

const incoming = (): MergePaneStates => ({
    caption: { side: "incoming", role: "upstream", ref: "feature", shortHash: "9f8e7d6" },
    marks: {
        takenFromThisSide: ["Flow_2", "Gateway_1", "Flow_3"],
        takenFromOtherSide: [],
        conflict: ["ServiceTask_1"],
    },
    shapelessRows: SHAPELESS_ROWS,
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
    ...noPicks(),
    build: { canBuild: false, openConflicts: 2, built: false, notes: [] },
});

const PREVIEW_OFFERS = { elementXmlChanges: true, elementXmlMerge: false } as const;

function paneStates(side: DiffSide): MergePaneStates {
    return side === "before" ? current() : incoming();
}

/** What a pane of the preview gets once it reports ready; it offers Show XML changes. */
export function mockMergeStates(side: DiffSide): ApplyMergeStatesQuery {
    return new ApplyMergeStatesQuery(side, paneStates(side), PREVIEW_OFFERS);
}

/** How the preview answers Merge XML on `ServiceTask_1`: it takes the text, or refuses a changed type. */
export type MockMergeXmlAnswer = "accept" | "refuse";

export function mockMergeXmlAnswerOf(value: string | null): MockMergeXmlAnswer | undefined {
    return value === "accept" || value === "refuse" ? value : undefined;
}

const MERGE_XML_OFFERS = { elementXmlChanges: true, elementXmlMerge: true } as const;

/** `ServiceTask_1` kept from incoming by the user, so its XML can be merged by hand. */
function withServiceTaskKept(
    side: DiffSide,
    { mergedByHand }: { readonly mergedByHand: boolean },
): MergePaneStates {
    const states = paneStates(side);
    const pick = {
        keptSide: "incoming",
        scope: "element",
        ...(mergedByHand ? { mergedByHand: true as const } : {}),
    } as const;
    const badge = {
        id: "ServiceTask_1",
        kind: side === "after" ? "keptHere" : "replacedHere",
        pick,
    } as const;
    const marked = side === "after" ? "takenFromThisSide" : "takenFromOtherSide";
    return {
        ...states,
        marks: {
            ...states.marks,
            conflict: [],
            [marked]: [...states.marks[marked], "ServiceTask_1"],
        },
        openConflictSteps: states.openConflictSteps.filter(({ id }) => id !== "ServiceTask_1"),
        openConflicts: 1,
        badges: [badge],
        pickable: states.pickable.map((pickable) =>
            pickable.id === "ServiceTask_1"
                ? {
                      id: "ServiceTask_1",
                      takenSide: "incoming",
                      pick,
                      handMergeable: true,
                  }
                : pickable,
        ),
        build: { ...states.build, openConflicts: 1 },
    };
}

/** The preview's states with Merge XML offered on `ServiceTask_1`. */
export function mockMergeXmlStates(side: DiffSide): ApplyMergeStatesQuery {
    return new ApplyMergeStatesQuery(
        side,
        withServiceTaskKept(side, { mergedByHand: false }),
        MERGE_XML_OFFERS,
    );
}

/** The states after the merge editor closed with a save: taken, or refused for a changed type. */
export function mockMergeXmlFinished(
    side: DiffSide,
    answer: MockMergeXmlAnswer,
): ApplyMergeStatesQuery {
    const accepted = answer === "accept";
    const states = withServiceTaskKept(side, { mergedByHand: accepted });
    const action = "mergeByHand";
    const elementId = "ServiceTask_1";
    return new ApplyMergeStatesQuery(
        side,
        {
            ...states,
            lastOutcome: accepted
                ? { applied: true, action, elementId, pulledIn: [], dropped: [], reopened: [] }
                : {
                      applied: false,
                      action,
                      elementId,
                      blockedBy: [],
                      handMergeRefusal: {
                          kind: "typeChanged",
                          expected: "bpmn:ServiceTask",
                          found: "bpmn:UserTask",
                      },
                  },
        },
        MERGE_XML_OFFERS,
    );
}
