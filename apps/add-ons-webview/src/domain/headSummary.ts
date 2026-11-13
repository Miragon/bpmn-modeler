import type { AddOnPayload } from "@miragon/bpmn-modeler-shared";

import { needsReview } from "./catalogFilter";

/** What a closed group or source still tells: how much it holds and how much waits for a review. */
export interface HeadSummary {
    readonly total: number;
    readonly waiting: number;
}

export function headSummaryOf(addOns: readonly AddOnPayload[]): HeadSummary {
    return { total: addOns.length, waiting: addOns.filter(needsReview).length };
}
