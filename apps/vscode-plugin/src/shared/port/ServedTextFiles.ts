/** Text files the host serves to editors under its own scheme, addressed as `Address`. */
export interface ServedTextFiles<Address> {
    setContent(address: Address, content: string): void;
    deleteFile(address: Address): void;
}

/** Served text files that also know the last text an editor wrote to each. */
export interface EditorWrittenTextFiles<Address> extends ServedTextFiles<Address> {
    lastEditorWriteOf(address: Address): string | undefined;
}
