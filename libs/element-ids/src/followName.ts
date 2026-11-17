import type { ModdleElementLike } from "./moddleElement";
import type { IdConvention } from "./convention";
import { defaultIdPrefixesOf } from "./elementKinds";
import { idFollowsName } from "./proposals";

/** An element's ID with the name and business object it had before a change. */
export interface IdBeforeChange {
    readonly id: string;
    readonly oldName: string | undefined;
    readonly oldElement: ModdleElementLike;
    readonly convention: IdConvention;
}

// The token window and mix of the bundled `no-generated-ids` rule (`naming.isGeneratedId`),
// which followName.spec holds this to: bpmn-js writes seven base-36 digits, other tools six to
// eight. A letter and a digit keep `Gateway_approve` out, at the price of the rare random ID
// without a digit; a token of digits only is a counter.
const RANDOM_TOKEN = "(?=[0-9a-z]*[a-z])(?=[0-9a-z]*\\d)[0-9a-z]{6,8}";
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
export function followsChange({ id, oldName, oldElement, convention }: IdBeforeChange): boolean {
    if (isDefaultId(id, oldElement.$type)) {
        return true;
    }
    return oldName !== undefined && idFollowsName(id, oldName, oldElement, convention);
}
