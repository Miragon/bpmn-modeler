import { MergeWorkingFile, MergeWorkingFileText } from "../diff/port/MergeWorkingFile";

/**
 * Working files in memory: the text on disk, and an editor's unsaved text
 * over it. A replace keeps the file's line endings, as an editor does, and
 * runs the save's formatting, as an editor's save participants may.
 */
export class FakeMergeWorkingFile implements MergeWorkingFile {
    /** Every replace, in order. */
    readonly replaced: { readonly fileUri: string; readonly text: string }[] = [];

    private readonly disk = new Map<string, string>();
    private readonly unsaved = new Map<string, string>();
    private formatOnSave: (text: string) => string = (text) => text;

    async read(fileUri: string): Promise<MergeWorkingFileText> {
        const unsaved = this.unsaved.get(fileUri);
        if (unsaved !== undefined) return { text: unsaved, isDirty: true };
        const text = this.disk.get(fileUri);
        if (text === undefined) throw new Error(`No file at ${fileUri}`);
        return { text, isDirty: false };
    }

    async replace(fileUri: string, text: string): Promise<void> {
        this.replaced.push({ fileUri, text });
        const eol = lineEndingOf(this.unsaved.get(fileUri) ?? this.disk.get(fileUri) ?? "");
        this.unsaved.delete(fileUri);
        this.disk.set(fileUri, this.formatOnSave(text.replace(/\r\n|\r|\n/g, eol)));
    }

    /** Every later save of a replace runs `format`, as a formatter on save does. */
    formatsOnSave(format: (text: string) => string): void {
        this.formatOnSave = format;
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

function lineEndingOf(text: string): string {
    const crlf = text.split("\r\n").length - 1;
    const breaks = text.split("\n").length - 1;
    return crlf > breaks / 2 ? "\r\n" : "\n";
}
