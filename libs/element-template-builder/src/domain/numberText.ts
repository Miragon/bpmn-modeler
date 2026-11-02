export type NumberText =
    { kind: "empty" } | { kind: "number"; value: number } | { kind: "invalid" };

/** What the text of a number field means. JSON has no infinity, so neither do its numbers. */
export function readNumberText(text: string): NumberText {
    const trimmed = text.trim();
    if (trimmed === "") {
        return { kind: "empty" };
    }
    const value = Number(trimmed);
    return Number.isFinite(value) ? { kind: "number", value } : { kind: "invalid" };
}

/** The text the file's value will show for what was typed: `1.` means `1`. */
export function normalizedNumberText(text: string): string {
    const parsed = readNumberText(text);
    return parsed.kind === "number" ? String(parsed.value) : parsed.kind === "empty" ? "" : text;
}
