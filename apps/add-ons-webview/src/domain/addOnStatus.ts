import type { AddOnPayload } from "@miragon/bpmn-modeler-shared";

import { needsReview } from "./catalogFilter";
import { CHROME_TEXT } from "./chromeTexts";

export type StatusTone = "danger" | "warning" | "success" | "neutral";

export interface RowStatus {
    readonly tone: StatusTone;
    readonly word: string;
}

const SETTLED_STATES: ReadonlySet<AddOnPayload["state"]> = new Set(["approved", "enabled"]);

/** The add-on's state alone, read from what the core offers and says. */
export function stateToneOf(addOn: AddOnPayload): Exclude<StatusTone, "danger"> {
    if (needsReview(addOn)) return "warning";
    return SETTLED_STATES.has(addOn.state) ? "success" : "neutral";
}

/** What a list row shows on its right: a problem outranks the state. */
export function rowStatusOf(addOn: AddOnPayload): RowStatus {
    if (addOn.problem !== undefined) return { tone: "danger", word: CHROME_TEXT.problem };
    const tone = stateToneOf(addOn);
    return { tone, word: tone === "warning" ? CHROME_TEXT.needsReview : addOn.stateText };
}
