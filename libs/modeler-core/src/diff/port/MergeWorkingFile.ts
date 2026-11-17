/** The working file's text as the user has it: unsaved edits included, and whether there are any. */
export interface MergeWorkingFileText {
    readonly text: string;
    readonly isDirty: boolean;
}

/** The conflicted file in the working tree, which a build of the merge result replaces. */
export interface MergeWorkingFile {
    /** The open text with unsaved edits, or the file on disk when no editor has it. */
    read(fileUri: string): Promise<MergeWorkingFileText>;
    /** Replaces the whole text and saves, so open editors follow; never stages. */
    replace(fileUri: string, text: string): Promise<void>;
}
