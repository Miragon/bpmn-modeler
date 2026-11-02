/** What a host knows about a template file at the moment an editor shows it. */
export interface ShownTemplate {
    /** The file's identity across editors, e.g. its stringified URI. */
    readonly file: string;
    readonly isLocalFile: boolean;
    readonly inEditorArea: boolean;
    readonly isDiff: boolean;
    /** The user's setting for opening the preview on its own. */
    readonly enabled: boolean;
    readonly hasPreview: boolean;
}

/**
 * When a template's preview opens without being asked for: once per opened file,
 * so a preview the user closed stays closed until the file is opened again.
 */
export class TemplatePreviewAutoOpen {
    private readonly shownFiles = new Set<string>();

    onShown(shown: ShownTemplate): "open" | "skip" {
        // Diffs, git refs and peek editors show a template without editing it, so
        // they neither open a preview nor use up the file's one automatic opening.
        if (!shown.isLocalFile || !shown.inEditorArea || shown.isDiff) {
            return "skip";
        }
        if (this.shownFiles.has(shown.file)) {
            return "skip";
        }
        this.shownFiles.add(shown.file);
        return shown.enabled && !shown.hasPreview ? "open" : "skip";
    }

    /** @param stillOpen Whether another text tab still shows the file. */
    onClosed(file: string, stillOpen: boolean): void {
        if (!stillOpen) {
            this.shownFiles.delete(file);
        }
    }
}
