/** A modeler that shows one document and reports the person's edits to it. */
export interface ModelCanvas {
    /** Shows `text`; `false` when the canvas could not open it. */
    importText(text: string): Promise<boolean>;
    exportText(): Promise<string>;
    /** Applies input a properties-panel field or table cell still holds back. */
    applyPendingInput(): void;
    /** A change on the canvas's command stack; an import never fires it. */
    onEdit(listener: () => void): () => void;
}
