import type {
    ActionViewPayload,
    AddOnActionKindPayload,
    AddOnPayload,
    AddOnReviewPayload,
} from "@miragon/bpmn-modeler-shared";

export interface PlacedActions {
    readonly rowLine: readonly ActionViewPayload<AddOnActionKindPayload>[];
    /** At the end of the review; absent without one, so code is never a plain toggle. */
    readonly allow?: ActionViewPayload<AddOnActionKindPayload>;
}

/** A code row's review, which the core writes for a row that offers Allow; a template has none. */
export function reviewOf(addOn: AddOnPayload): AddOnReviewPayload | undefined {
    return "review" in addOn ? addOn.review : undefined;
}

export function placedActions(addOn: AddOnPayload): PlacedActions {
    const allow = addOn.actions.find(({ kind }) => kind === "allow");
    const reviewed = reviewOf(addOn) !== undefined;
    return {
        rowLine: addOn.actions.filter((action) => action !== allow),
        ...(allow && reviewed && { allow }),
    };
}
