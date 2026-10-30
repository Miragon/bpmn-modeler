export interface FormPreviewState<T> {
    target?: T;
    reference?: string;
    dismissed: boolean;
    attempted: boolean;
    explicit: boolean;
    available?: boolean;
}

export type FormPreviewEvent<T> =
    | {
          kind: "selection";
          target?: T;
          reference?: string;
          available: boolean | undefined;
          visible?: boolean;
      }
    | { kind: "manual"; target: T; available: boolean }
    | { kind: "dismiss" }
    | { kind: "refresh" };

export function reduceFormPreview<T>(
    state: FormPreviewState<T>,
    event: FormPreviewEvent<T>,
): { state: FormPreviewState<T> } & (
    { action: "open"; automatic: boolean } | { action: "close" | "keep" | "indicate" }
) {
    if (event.kind === "dismiss")
        return { state: { ...state, dismissed: true, explicit: false }, action: "close" };
    if (event.kind === "refresh") return { state: { ...state, explicit: true }, action: "keep" };
    if (event.kind === "manual") {
        if (event.target !== state.target || !state.reference || !event.available)
            return { state, action: "keep" };
        return {
            state: { ...state, dismissed: false, attempted: true, explicit: true },
            action: "open",
            automatic: false,
        };
    }
    const { target, reference, available, visible } = event;
    const changed = target !== state.target || reference !== state.reference;
    if (!changed && reference && (state.explicit || (visible && state.available === available)))
        return { state, action: "keep" };
    const next: FormPreviewState<T> = changed
        ? { target, reference, dismissed: false, attempted: false, explicit: false }
        : { ...state };
    const availabilityChanged = state.available !== available;
    next.available = available;
    if (!reference || available === undefined) {
        next.attempted = false;
        return { state: next, action: "close" };
    }
    if (!next.dismissed && (changed || availabilityChanged || !next.attempted) && !available) {
        next.attempted = true;
        return { state: next, action: "indicate" };
    }
    if (availabilityChanged) next.attempted = false;
    if (!next.dismissed && !next.attempted) {
        next.attempted = true;
        return { state: next, action: "open", automatic: true };
    }
    return { state: next, action: "keep" };
}
