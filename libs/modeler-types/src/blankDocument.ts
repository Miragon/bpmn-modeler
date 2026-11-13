/**
 * Whether a model file has no content yet and opens as a new diagram.
 *
 * Whitespace counts as blank: an editor or tool that saves a file with only a
 * line break left nothing a modeler could import.
 */
export function isBlankDocument(text: string | undefined): boolean {
    return text === undefined || text.trim() === "";
}
