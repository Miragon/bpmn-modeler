export function normalizeValidationBounds(
    validation: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const normalized: Record<string, unknown> = { ...validation };
    for (const bound of ["min", "max"] as const) {
        const value = normalized[bound];
        if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
            normalized[bound] = Number(value);
        }
    }
    for (const bound of ["minLength", "maxLength"] as const) {
        if (typeof normalized[bound] === "number") {
            normalized[bound] = String(normalized[bound]);
        }
    }
    return normalized;
}
