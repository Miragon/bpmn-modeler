import { MergeWorkingFile, MergeWorkingFileText } from "../diff/port/MergeWorkingFile";

/** Working files in memory: the text on disk, and an editor's unsaved text over it. */
export class FakeMergeWorkingFile implements MergeWorkingFile {
    /** Every replace, in order. */
    readonly replaced: { readonly fileUri: string; readonly text: string }[] = [];

    private readonly disk = new Map<string, string>();
    private readonly unsaved = new Map<string, string>();

    async read(fileUri: string): Promise<MergeWorkingFileText> {
        const unsaved = this.unsaved.get(fileUri);
        if (unsaved !== undefined) return { text: unsaved, isDirty: true };
        const text = this.disk.get(fileUri);
        if (text === undefined) throw new Error(`No file at ${fileUri}`);
        return { text, isDirty: false };
    }

    async replace(fileUri: string, text: string): Promise<void> {
        this.replaced.push({ fileUri, text });
        this.unsaved.delete(fileUri);
        this.disk.set(fileUri, text);
    }

    /** Puts `text` on disk, as Git leaves the file. */
    onDisk(fileUri: string, text: string): void {
        this.disk.set(fileUri, text);
    }

    /** An editor of the file changes its text to `text` without saving. */
    editUnsaved(fileUri: string, text: string): void {
        this.unsaved.set(fileUri, text);
    }

    /** The user saves an editor's unsaved text. */
    save(fileUri: string): void {
        const unsaved = this.unsaved.get(fileUri);
        if (unsaved === undefined) return;
        this.unsaved.delete(fileUri);
        this.disk.set(fileUri, unsaved);
    }

    diskText(fileUri: string): string | undefined {
        return this.disk.get(fileUri);
    }
}
