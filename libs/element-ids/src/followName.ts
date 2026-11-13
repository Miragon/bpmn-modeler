import type { ElementIdStyle } from "@miragon/bpmn-modeler-types";

import { defaultIdPrefixesOf } from "./elementKinds";
import { idFollowsName } from "./proposals";

/** An element's ID with the name and type it had before a change. */
export interface IdBeforeChange {
    readonly id: string;
    readonly oldName: string | undefined;
    readonly oldType: string;
    readonly style: ElementIdStyle;
}

// bpmn-js pads a random 32-bit number to seven base-36 digits; requiring one digit
// keeps hand-written IDs like `Gateway_approve` out, at the price of the rare random ID without one.
const RANDOM_TOKEN = "(?=[0-9a-z]*\\d)[0-9a-z]{7}";
// Diagram templates number their elements: `StartEvent_1`, `Process_1`.
const COUNTER = "\\d+";

/** An ID bpmn-js or a template gave an element of this type; `Invoice_1` was typed by someone. */
function isDefaultId(id: string, type: string): boolean {
    const prefixes = defaultIdPrefixesOf(type).join("|");
    return new RegExp(`^(?:${prefixes})_(?:${COUNTER}|${RANDOM_TOKEN})$`).test(id);
}

/**
 * Whether an ID should change along with its element's name or type: it was generated,
 * either by bpmn-js or a template, or from the old name and type. An ID someone wrote stays.
 */
export function followsChange({ id, oldName, oldType, style }: IdBeforeChange): boolean {
    if (isDefaultId(id, oldType)) {
        return true;
    }
    return oldName !== undefined && idFollowsName(id, oldName, oldType, style);
}
