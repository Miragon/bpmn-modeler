import type { MergePickScope } from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

/** A pick or undo this pane sent, remembered until the host's states answer it. */
export interface MergeActedDecision {
    readonly action: "pick" | "unpick";
    readonly elementId: string;
    readonly scope: MergePickScope;
    /** The side the pick kept; for a leave-out the side that removed the element. */
    readonly side: MergeSide;
}
