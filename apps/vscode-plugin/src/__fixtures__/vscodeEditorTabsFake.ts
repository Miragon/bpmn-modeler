/**
 * The slice of the `vscode` module the script tabs touch, for
 * `vi.mock("vscode", () => import(".../vscodeEditorTabsFake"))`: text documents
 * read from disk, editors shown beside the diagram and the tabs that show them.
 * It keeps what the user would see, the open tabs. Call
 * {@link resetVscodeEditorTabs} before each test.
 */
import { Uri } from "./vscodeFileSystemFake";

export { Uri };

export enum ViewColumn {
    Active = -1,
    Beside = -2,
}

export class TabInputText {
    constructor(readonly uri: Uri) {}
}

export class Range {
    constructor(
        readonly start: unknown,
        readonly end: unknown,
    ) {}
}

export class WorkspaceEdit {
    readonly replacements: { uri: Uri; range: Range; newText: string }[] = [];

    replace(uri: Uri, range: Range, newText: string): void {
        this.replacements.push({ uri, range, newText });
    }
}

export class FakeTextDocument {
    languageId = "plaintext";
    isDirty = false;

    constructor(
        readonly uri: Uri,
        private text: string,
    ) {}

    getText(): string {
        return this.text;
    }

    positionAt(offset: number): { offset: number } {
        return { offset };
    }

    edit(text: string): void {
        this.text = text;
        this.isDirty = true;
    }

    async save(): Promise<boolean> {
        this.isDirty = false;
        return true;
    }
}

interface FakeTab {
    readonly input: TabInputText;
}

interface TabChange {
    readonly opened: readonly FakeTab[];
    readonly closed: readonly FakeTab[];
    readonly changed: readonly FakeTab[];
}

const tabs: FakeTab[] = [];
const documents: FakeTextDocument[] = [];
const tabListeners = new Set<(change: TabChange) => void>();
let readFromDisk: (path: string) => Promise<string> = async (path) => {
    throw new Error(`Nothing to read ${path} from; call resetVscodeEditorTabs first`);
};

/** Forgets every tab and document; `read` answers what a document opened from disk holds. */
export function resetVscodeEditorTabs(read: (path: string) => Promise<string>): void {
    tabs.length = 0;
    documents.length = 0;
    tabListeners.clear();
    readFromDisk = read;
}

/** The user closes the tab showing the file at `path`. */
export function closeTabByUser(path: string): void {
    const uri = Uri.file(path);
    const tab = tabs.find((candidate) => showsUri(candidate, uri));
    if (!tab) {
        throw new Error(`No tab shows ${path}`);
    }
    closeTab(tab);
}

function showsUri(tab: FakeTab, uri: Uri): boolean {
    return tab.input.uri.toString() === uri.toString();
}

// The document goes with its tab; VS Code keeps it a little longer, which the scenarios never reach.
function closeTab(tab: FakeTab): void {
    tabs.splice(tabs.indexOf(tab), 1);
    const shown = documents.findIndex((document) => showsUri(tab, document.uri));
    if (shown >= 0) documents.splice(shown, 1);
    fireTabChange({ opened: [], closed: [tab], changed: [] });
}

function fireTabChange(change: TabChange): void {
    tabListeners.forEach((listener) => listener(change));
}

async function openTextDocument(uri: Uri): Promise<FakeTextDocument> {
    const open = documents.find((document) => document.uri.toString() === uri.toString());
    if (open) return open;
    const document = new FakeTextDocument(uri, await readFromDisk(uri.fsPath));
    documents.push(document);
    return document;
}

const noSubscription = { dispose: () => undefined };

export const workspace = {
    get textDocuments(): readonly FakeTextDocument[] {
        return documents;
    },
    openTextDocument,
    async applyEdit(edit: WorkspaceEdit): Promise<boolean> {
        for (const { uri, newText } of edit.replacements) {
            (await openTextDocument(uri)).edit(newText);
        }
        return true;
    },
    onDidChangeTextDocument: () => noSubscription,
    onDidSaveTextDocument: () => noSubscription,
};

export const languages = {
    async setTextDocumentLanguage(
        document: FakeTextDocument,
        languageId: string,
    ): Promise<FakeTextDocument> {
        document.languageId = languageId;
        return document;
    },
};

export const window = {
    async showTextDocument(document: FakeTextDocument): Promise<{ document: FakeTextDocument }> {
        if (!tabs.some((tab) => showsUri(tab, document.uri))) {
            const tab = { input: new TabInputText(document.uri) };
            tabs.push(tab);
            fireTabChange({ opened: [tab], closed: [], changed: [] });
        }
        return { document };
    },
    tabGroups: {
        get all(): readonly { tabs: readonly FakeTab[] }[] {
            return [{ tabs }];
        },
        async close(tab: FakeTab): Promise<boolean> {
            if (tabs.includes(tab)) closeTab(tab);
            return true;
        },
        onDidChangeTabs(listener: (change: TabChange) => void): { dispose(): void } {
            tabListeners.add(listener);
            return { dispose: () => tabListeners.delete(listener) };
        },
    },
};
