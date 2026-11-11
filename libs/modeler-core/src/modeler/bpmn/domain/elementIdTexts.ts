import type { ElementIdReviewStatus } from "@miragon/bpmn-modeler-types";

export const SWITCH_MODE_TO_GENERATE_IDS =
    "Switch to Design or Implement mode to generate IDs from names.";

/** The notice a review outcome calls for: an opened review shows itself, and an unknown status stays quiet. */
export function elementIdReviewNotice(status: ElementIdReviewStatus): string | undefined {
    return status === "unsupported" ? SWITCH_MODE_TO_GENERATE_IDS : undefined;
}
