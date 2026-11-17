/**
 * The slice of the `vscode` module that edits and saves text documents, for
 * `vi.mock("vscode", () => import(".../vscodeTextDocumentsFake"))`: files on
 * an in-memory disk, the text documents open over them with their unsaved
 * edits, `workspace.applyEdit` with whole-range replaces and `save`. Like
 * VS Code, a document keeps the line endings it was opened with. Call
 * {@link resetTextDocuments} before each test.
 */
import { Uri } from "./vscodeFileSystemFake";

export { Uri } from "./vscodeFileSystemFake";

const disk = new Map<string, string>();
const documents = new Map<string, FakeTextDocument>();
const failingSaves = new Set<string>();

export class Position {
    constructor(readonly offset: number) {}
}

export class Range {
    constructor(
        readonly start: Position,
        readonly end: Position,
    ) {}
}

export class WorkspaceEdit {
    readonly replaces: { uri: Uri; range: Range; text: string }[] = [];

    replace(uri: Uri, range: Range, text: string): void {
        this.replaces.push({ uri, range, text });
    }
}

class FakeTextDocument {
    isDirty = false;

    private readonly eol: string;

    constructor(
        readonly uri: Uri,
        private text: string,
    ) {
        this.eol = lineEndingOf(text);
    }

    getText(): string {
        return this.text;
    }

    positionAt(offset: number): Position {
        return new Position(Math.max(0, Math.min(offset, this.text.length)));
    }

    edit(range: Range, text: string): void {
        this.text =
            this.text.slice(0, range.start.offset) +
            text.replace(/\r\n|\r|\n/g, this.eol) +
            this.text.slice(range.end.offset);
        this.isDirty = true;
    }

    async save(): Promise<boolean> {
        if (failingSaves.delete(this.uri.toString())) return false;
        disk.set(this.uri.toString(), this.text);
        this.isDirty = false;
        return true;
    }
}

export const workspace = {
    get textDocuments(): readonly FakeTextDocument[] {
        return [...documents.values()];
    },
    async openTextDocument(uri: Uri): Promise<FakeTextDocument> {
        return openDocument(uri);
    },
    async applyEdit(edit: WorkspaceEdit): Promise<boolean> {
        for (const { uri, range, text } of edit.replaces) openDocument(uri).edit(range, text);
        return true;
    },
    fs: {
        async readFile(uri: Uri): Promise<Uint8Array> {
            const text = disk.get(uri.toString());
            if (text === undefined) throw new Error(`ENOENT ${uri.toString()}`);
            return new TextEncoder().encode(text);
        },
    },
};

// VS Code takes CRLF when most of a text's line breaks are CRLF.
function lineEndingOf(text: string): string {
    const crlf = text.split("\r\n").length - 1;
    const breaks = text.split("\n").length - 1;
    return crlf > breaks / 2 ? "\r\n" : "\n";
}

function openDocument(uri: Uri): FakeTextDocument {
    const key = uri.toString();
    const open = documents.get(key);
    if (open) return open;
    const text = disk.get(key);
    if (text === undefined) throw new Error(`ENOENT ${key}`);
    const document = new FakeTextDocument(uri, text);
    documents.set(key, document);
    return document;
}

export function resetTextDocuments(): void {
    disk.clear();
    documents.clear();
    failingSaves.clear();
}

/** The next save of the file reports that it did not save, as on a save conflict. */
export function failNextSave(uri: string): void {
    failingSaves.add(Uri.parse(uri).toString());
}

/** The text an open document of the file holds, unsaved edits included. */
export function documentText(uri: string): string | undefined {
    return documents.get(Uri.parse(uri).toString())?.getText();
}

export function writeOnDisk(uri: string, text: string): void {
    disk.set(Uri.parse(uri).toString(), text);
}

export function textOnDisk(uri: string): string | undefined {
    return disk.get(Uri.parse(uri).toString());
}

/** An editor opens the file and the user types `text` over it without saving. */
export function typeUnsaved(uri: string, text: string): void {
    const document = openDocument(Uri.parse(uri));
    document.edit(new Range(new Position(0), new Position(document.getText().length)), text);
}
