export type TemplateFileName =
    { kind: "valid"; fileName: string } | { kind: "invalid"; message: string };

// Windows forbids these in names, and template folders are shared across systems.
const UNPORTABLE_CHARACTER = /[/\\:*?"<>|]/;

/**
 * The file "New Element Template" creates for the name the user typed. A name
 * with spaces becomes kebab-case; one without stays as typed, such as a
 * reverse-domain id.
 */
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
    const base = /\s/.test(name) ? name.toLowerCase().split(/\s+/).join("-") : name;
    return { kind: "valid", fileName: `${base}.json` };
}

/** What "New Element Template" says; the host only renders it. */
export const NEW_TEMPLATE_TEXTS = {
    title: "New Element Template",
    fileFilter: "Element Template",
    folderPlaceholder: "Workspace folder for the new element template",
    defaultFileName: "new-template",
} as const;

export function templateFilePrompt(folder: string): string {
    return `The file name of the new template. It goes into ${folder}.`;
}

export function templateFileTaken(fileName: string, folder?: string): string {
    return folder ? `${fileName} already exists in ${folder}.` : `${fileName} already exists.`;
}

export function templateFileCreated(fileName: string): string {
    return `Creates ${fileName}.`;
}
