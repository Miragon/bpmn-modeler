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
    type MergePaneStates,
    type MergePaneStep,
} from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

const step = (id: string, onThisPane: boolean, shapeless = false): MergePaneStep => ({
    id,
    shapeless,
    onThisPane,
});

const SHAPELESS = [{ id: "Process_1", type: "bpmn:Process", marker: "conflict" }] as const;

const CURRENT: MergePaneStates = {
    caption: { side: "current", role: "branch", ref: "main", shortHash: "1a2b3c4" },
    marks: {
        takenFromThisSide: [],
        takenFromOtherSide: ["Flow_2", "UserTask_ToRemove", "Flow_3"],
        conflict: ["ServiceTask_1"],
    },
    shapeless: SHAPELESS,
    openConflictSteps: [step("ServiceTask_1", true), step("Process_1", true, true)],
    allSteps: [
        step("ServiceTask_1", true),
        step("Flow_2", true),
        step("UserTask_ToRemove", true),
        step("Gateway_1", false),
        step("Flow_3", true),
        step("Process_1", true, true),
    ],
    openConflicts: 2,
};

const INCOMING: MergePaneStates = {
    caption: { side: "incoming", role: "upstream", ref: "feature", shortHash: "9f8e7d6" },
    marks: {
        takenFromThisSide: ["Flow_2", "Gateway_1", "Flow_3"],
        takenFromOtherSide: [],
        conflict: ["ServiceTask_1"],
    },
    shapeless: SHAPELESS,
    openConflictSteps: [step("ServiceTask_1", true), step("Process_1", true, true)],
    allSteps: [
        step("ServiceTask_1", true),
        step("Flow_2", true),
        step("UserTask_ToRemove", false),
        step("Gateway_1", true),
        step("Flow_3", true),
        step("Process_1", true, true),
    ],
    openConflicts: 2,
};

/** What each pane of the preview gets once it reports ready; it offers Show XML changes. */
export const MOCK_MERGE_STATES: Readonly<Record<DiffSide, ApplyMergeStatesQuery>> = {
    before: new ApplyMergeStatesQuery("before", CURRENT, true),
    after: new ApplyMergeStatesQuery("after", INCOMING, true),
};
