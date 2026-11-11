import type { ElementIdStyle } from "@miragon/bpmn-modeler-types";

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
const RANDOM_ID = /^[A-Za-z]+_(?=[0-9a-z]*\d)[0-9a-z]{7}$/;
const NUMBERED_PLACEHOLDER = /^[A-Za-z]+_\d+$/;

/**
 * Whether an ID should change along with its element's name or type: it was generated,
 * either at random by bpmn-js or from the old name and type. An ID someone wrote stays.
 */
export function followsChange({ id, oldName, oldType, style }: IdBeforeChange): boolean {
    if (RANDOM_ID.test(id) || NUMBERED_PLACEHOLDER.test(id)) {
        return true;
    }
    return oldName !== undefined && idFollowsName(id, oldName, oldType, style);
}
