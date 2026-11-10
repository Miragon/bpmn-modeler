const NUMERIC_BOUNDS = ["min", "max", "minLength", "maxLength"] as const;

export function normalizeNumericValidation(validation: unknown): unknown {
    if (typeof validation !== "object" || validation === null || Array.isArray(validation)) {
        return validation;
    }

    const normalized: Record<string, unknown> = { ...validation };
    for (const bound of NUMERIC_BOUNDS) {
        if (typeof normalized[bound] === "number") {
            normalized[bound] = String(normalized[bound]);
        }
    }
    return normalized;
}
