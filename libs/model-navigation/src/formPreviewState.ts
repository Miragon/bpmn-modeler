export interface FormPreviewState<T> {
    target?: T;
    reference?: string;
    dismissed: boolean;
    attempted: boolean;
    explicit: boolean;
}

export type FormPreviewEvent<T> =
    | { kind: "selection"; target?: T; reference?: string; available: boolean; visible?: boolean }
    | { kind: "manual"; target: T; available: boolean }
    | { kind: "dismiss" };

export function reduceFormPreview<T>(
    state: FormPreviewState<T>,
    event: FormPreviewEvent<T>,
): { state: FormPreviewState<T> } & (
    { action: "open"; automatic: boolean } | { action: "close" | "keep" }
) {
    if (event.kind === "dismiss")
        return { state: { ...state, dismissed: true, explicit: false }, action: "close" };
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
    if (!changed && reference && (visible || state.explicit)) return { state, action: "keep" };
    const next = changed
        ? { target, reference, dismissed: false, attempted: false, explicit: false }
        : { ...state };
    if (!reference || !available) {
        next.attempted = false;
        return { state: next, action: "close" };
    }
    if (!next.dismissed && !next.attempted) {
        next.attempted = true;
        return { state: next, action: "open", automatic: true };
    }
    return { state: next, action: "keep" };
}
