/** Where a host shows the merge view's command: Source Control rows, editor titles, the palette. */
export interface MergeCommandAvailability {
    /** The files the merge view opens; the host shows the command for them and while any exists. */
    setResolvable(fileUris: readonly string[]): void;
}
