const NUMERIC_BOUNDS = ["min", "max", "minLength", "maxLength"] as const;

export function withStringBounds(
    validation: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...validation };
    for (const bound of NUMERIC_BOUNDS) {
        if (typeof normalized[bound] === "number") {
            normalized[bound] = String(normalized[bound]);
        }
    }
    return normalized;
}
