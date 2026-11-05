/** Orca's document of one editor tab: the file's text and how the editor may change it. */
export interface DocumentSession {
    /** The latest text, including changes Orca has not accepted yet. */
    readonly value: string;
    /** An agent transcript or a remote file the person may not change. */
    readonly readOnly: boolean;
    /** The file changed outside the editor. */
    onReplace(listener: (text: string) => void): () => void;
    change(text: string): void;
    /** Sends the pending change now. */
    flush(): Promise<void>;
    /** Orca is about to save; it waits for the returned promise. */
    onSaveRequested(listener: () => Promise<void>): () => void;
    dispose(): void;
}
