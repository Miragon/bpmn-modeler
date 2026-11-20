export const MODEL_NAVIGATION_TEXTS = {
    navigate: "Navigate to referenced model",
    previewForm: "Preview linked form",
} as const;

/** Every key the context pad entries pass to translate(). */
export const MODEL_NAVIGATION_KEYS: readonly string[] = Object.values(MODEL_NAVIGATION_TEXTS);
