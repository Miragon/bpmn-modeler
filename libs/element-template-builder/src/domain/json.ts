/** What the builder reads from a parsed template, which may not be what the schema asks for. */
export type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function objectOf(value: unknown): Json {
    return isObject(value) ? value : {};
}

export function arrayOf(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

export function stringOf(value: unknown): string {
    return typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : "";
}

export function stringsOf(value: unknown): string[] {
    return arrayOf(value).filter((item): item is string => typeof item === "string");
}

export function valueAt(owner: unknown, path: readonly (string | number)[]): unknown {
    return path.reduce<unknown>(
        (current, segment) =>
            current !== null && typeof current === "object"
                ? (current as Record<string | number, unknown>)[segment]
                : undefined,
        owner,
    );
}
