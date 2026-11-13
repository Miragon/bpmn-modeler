// Matches the plugin repo's drift tooling, so a legacy casing or spacing
// variant of a key compares equal to the modern one.
export const normalizeKey = (key: string): string =>
    key
        .toLowerCase()
        .replace(/\bthe\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.\s]+$/, "");
