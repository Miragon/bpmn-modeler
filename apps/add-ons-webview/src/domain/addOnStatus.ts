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

export interface DetailStatus {
    readonly tone: StatusTone;
    readonly words: readonly string[];
}

const NOT_LOADED: RowStatus = { tone: "danger", word: CHROME_TEXT.notLoaded };

/** What a list row shows on its right: a problem outranks the state, and a settled row says nothing. */
export function rowStatusOf(addOn: AddOnPayload): RowStatus | undefined {
    if (addOn.problem !== undefined) return NOT_LOADED;
    const tone = stateToneOf(addOn);
    if (tone === "success") return undefined;
    return { tone, word: tone === "warning" ? CHROME_TEXT.waiting : addOn.stateText };
}

/**
 * The detail's state line: the core's state, led by "Not loaded" when a
 * problem keeps the add-on from running, so an allowed add-on that does not
 * run never reads as plainly allowed.
 */
export function detailStatusOf(addOn: AddOnPayload): DetailStatus {
    if (addOn.problem !== undefined) {
        return { tone: NOT_LOADED.tone, words: [NOT_LOADED.word, addOn.stateText] };
    }
    return { tone: stateToneOf(addOn), words: [addOn.stateText] };
}
