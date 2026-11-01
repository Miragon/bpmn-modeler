export type TemplateFileName =
    { kind: "valid"; fileName: string } | { kind: "invalid"; message: string };

export const DEFAULT_TEMPLATE_FILE_NAME = "new-template";

// Windows forbids these in names, and template folders are shared across systems.
const UNPORTABLE_CHARACTER = /[/\\:*?"<>|]/;

/** The file "New Element Template" creates for the name the user typed. */
export function templateFileName(input: string): TemplateFileName {
    const name = input.trim().replace(/\.json$/i, "");
    if (/^\.*$/.test(name)) {
        return { kind: "invalid", message: "Enter a file name." };
    }
    if (UNPORTABLE_CHARACTER.test(name)) {
        return {
            kind: "invalid",
            message: 'A file name cannot contain any of these characters: / \\ : * ? " < > |',
        };
    }
    // The template loader only reads files ending in a lower-case `.json`.
    return { kind: "valid", fileName: `${name}.json` };
}
