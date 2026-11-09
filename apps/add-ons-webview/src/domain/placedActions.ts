import type {
    ActionViewPayload,
    AddOnActionKindPayload,
    AddOnPayload,
} from "@miragon/bpmn-modeler-shared";

export interface PlacedActions {
    readonly rowLine: readonly ActionViewPayload<AddOnActionKindPayload>[];
    /** At the end of the review; absent without one, so code is never a plain toggle. */
    readonly allow?: ActionViewPayload<AddOnActionKindPayload>;
}

export function placedActions(addOn: AddOnPayload): PlacedActions {
    const allow = addOn.actions.find(({ kind }) => kind === "allow");
    const reviewed = "review" in addOn && addOn.review !== undefined;
    return {
        rowLine: addOn.actions.filter((action) => action !== allow),
        ...(allow && reviewed && { allow }),
    };
}
