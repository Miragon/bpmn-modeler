export type FormSchema = Record<string, unknown>;

export interface FormSchemaImportResult {
    warnings?: unknown[];
}

/** The form editor's schema, which the document session imports from and exports to the host. */
export interface FormSchemaEditor {
    importSchema(schema: FormSchema): Promise<FormSchemaImportResult>;
    saveSchema(): FormSchema;
}

/** A field edit the form editor still debounces before it reaches the schema. */
export interface PendingEditorInput {
    hasPending(): boolean;
    flush(): void;
}

/** What the page shows while the document session loads a host document. */
export interface FormDocumentLoadListener {
    /** A newer host document arrived; `replacesDocument` says whether one was held before. */
    onArrived(replacesDocument: boolean): void;
    /** Runs while the session still counts the load as a pending host update. */
    onImported(warnings: unknown[]): Promise<void>;
    /** The session no longer holds a document. */
    onFailed(message: string, cause: unknown): void;
}
