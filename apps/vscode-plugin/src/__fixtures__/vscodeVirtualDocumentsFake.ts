/**
 * The slice of the `vscode` module that serves virtual documents, for
 * `vi.mock("vscode", () => import(".../vscodeVirtualDocumentsFake"))`: file
 * system providers, the text documents and editor tabs that show them, and
 * commands. It keeps what the user would see in the tabs. Call
 * {@link resetVscodeVirtualDocuments} before each test.
 */
import { Uri } from "./vscodeFileSystemFake";

export * from "./vscodeFileSystemFake";

export enum ViewColumn {
    Beside = -2,
}

export class TabInputText {
    constructor(readonly uri: Uri) {}
}

export interface FakeTab {
    readonly label: string;
    readonly input: TabInputText;
}

export interface TabChangeEvent {
    readonly opened: readonly FakeTab[];
    readonly closed: readonly FakeTab[];
    readonly changed: readonly FakeTab[];
}

interface ServedFileSystem {
    readFile(uri: Uri): Uint8Array;
    writeFile(
        uri: Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean },
    ): void;
}

interface Disposable {
    dispose(): void;
}

type Listener<T> = (event: T) => void;

export class FakeTextDocument {
    private editedText: string | undefined;

    constructor(readonly uri: Uri) {}

    get isDirty(): boolean {
        return this.editedText !== undefined;
    }

    // An unedited document follows its file, as VS Code reloads it when the provider reports a change.
    getText(): string {
        return this.editedText ?? readServedFile(this.uri);
    }

    async save(): Promise<boolean> {
        if (this.editedText === undefined) return true;
        fileSystemFor(this.uri).writeFile(this.uri, new TextEncoder().encode(this.editedText), {
            create: true,
            overwrite: true,
        });
        this.editedText = undefined;
        return true;
    }

    type(text: string): void {
        this.editedText = text;
        documentChangeListeners.forEach((listener) =>
            listener({ document: this, contentChanges: [{ text }], reason: undefined }),
        );
    }
}

export interface DocumentChangeEvent {
    readonly document: FakeTextDocument;
    readonly contentChanges: readonly { text: string }[];
    readonly reason: undefined;
}

export interface RenderedTab {
    readonly name: string;
    readonly content: string;
    readonly readOnly: boolean;
}

const fileSystems = new Map<string, { provider: ServedFileSystem; readOnly: boolean }>();
const documents: FakeTextDocument[] = [];
const tabs: FakeTab[] = [];
const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
const documentChangeListeners = new Set<Listener<DocumentChangeEvent>>();
const tabChangeListeners = new Set<Listener<TabChangeEvent>>();

export function resetVscodeVirtualDocuments(): void {
    fileSystems.clear();
    documents.length = 0;
    tabs.length = 0;
    registeredCommands.clear();
    documentChangeListeners.clear();
    tabChangeListeners.clear();
}

/** The open tabs left to right, with the text each one shows. */
export function renderedTabs(): RenderedTab[] {
    return tabs.map((tab) => ({
        name: tab.label,
        content: documentFor(tab.input.uri).getText(),
        readOnly: fileSystems.get(tab.input.uri.scheme)?.readOnly ?? false,
    }));
}

/** Plays the user typing `text` over the whole document shown in the tab named `name`. */
export function typeIntoTab(name: string, text: string): void {
    const tab = tabs.find((candidate) => candidate.label === name);
    if (!tab) throw new Error(`No tab named "${name}" is open.`);
    documentFor(tab.input.uri).type(text);
}

function fileSystemFor(uri: Uri): ServedFileSystem {
    const fileSystem = fileSystems.get(uri.scheme);
    if (!fileSystem) throw new Error(`No file system serves ${uri.scheme}:.`);
    return fileSystem.provider;
}

function readServedFile(uri: Uri): string {
    return new TextDecoder().decode(fileSystemFor(uri).readFile(uri));
}

function documentFor(uri: Uri): FakeTextDocument {
    const existing = documents.find((document) => document.uri.toString() === uri.toString());
    if (existing) return existing;
    const document = new FakeTextDocument(uri);
    documents.push(document);
    return document;
}

function subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>): Disposable {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
}

function openTab(uri: Uri): void {
    if (tabs.some((tab) => tab.input.uri.toString() === uri.toString())) return;
    const tab: FakeTab = { label: uri.path.split("/").pop() ?? "", input: new TabInputText(uri) };
    tabs.push(tab);
    tabChangeListeners.forEach((listener) => listener({ opened: [tab], closed: [], changed: [] }));
}

export const workspace = {
    get textDocuments(): readonly FakeTextDocument[] {
        return [...documents];
    },
    registerFileSystemProvider(
        scheme: string,
        provider: ServedFileSystem,
        options?: { isReadonly?: boolean },
    ): Disposable {
        fileSystems.set(scheme, { provider, readOnly: options?.isReadonly === true });
        return { dispose: () => fileSystems.delete(scheme) };
    },
    async openTextDocument(uri: Uri): Promise<FakeTextDocument> {
        readServedFile(uri);
        return documentFor(uri);
    },
    onDidChangeTextDocument(listener: Listener<DocumentChangeEvent>): Disposable {
        return subscribe(documentChangeListeners, listener);
    },
};

export const window = {
    activeTextEditor: undefined,
    tabGroups: {
        get all(): { tabs: readonly FakeTab[] }[] {
            return [{ tabs: [...tabs] }];
        },
        async close(tabOrTabs: FakeTab | readonly FakeTab[]): Promise<boolean> {
            const closing = (Array.isArray(tabOrTabs) ? tabOrTabs : [tabOrTabs]) as FakeTab[];
            const closed = closing.filter((tab) => tabs.includes(tab));
            for (const tab of closed) tabs.splice(tabs.indexOf(tab), 1);
            tabChangeListeners.forEach((listener) => listener({ opened: [], closed, changed: [] }));
            return true;
        },
        onDidChangeTabs(listener: Listener<TabChangeEvent>): Disposable {
            return subscribe(tabChangeListeners, listener);
        },
    },
};

export const commands = {
    registerCommand(
        command: string,
        handler: (...args: unknown[]) => unknown,
        thisArg?: unknown,
    ): Disposable {
        registeredCommands.set(command, handler.bind(thisArg));
        return { dispose: () => registeredCommands.delete(command) };
    },
    async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
        if (command === "vscode.openWith") {
            openTab(args[0] as Uri);
            return undefined;
        }
        const handler = registeredCommands.get(command);
        if (!handler) throw new Error(`command '${command}' not found`);
        return handler(...args);
    },
};
