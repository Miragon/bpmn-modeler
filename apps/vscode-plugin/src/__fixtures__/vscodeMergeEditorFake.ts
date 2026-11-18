/**
 * The slice of the `vscode` module VS Code's merge editor touches, for
 * `vi.mock("vscode", () => import(".../vscodeMergeEditorFake"))`:
 * `_open.mergeEditor` over files the extension serves, the merge tabs, the
 * result document the editor merged, its saves with their reasons and the
 * tabs closing. Call {@link resetVscodeMergeEditor} before each test.
 */
import { Uri } from "./vscodeFileSystemFake";

export * from "./vscodeFileSystemFake";

export enum TextDocumentSaveReason {
    Manual = 1,
    AfterDelay = 2,
    FocusOut = 3,
}

interface MergeEditorArgs {
    readonly base: Uri;
    readonly input1: { readonly uri: Uri; readonly title: string };
    readonly input2: { readonly uri: Uri; readonly title: string };
    readonly output: Uri;
}

interface MergeTabInput {
    readonly base: Uri;
    readonly input1: Uri;
    readonly input2: Uri;
    readonly result: Uri;
}

export interface FakeMergeTab {
    readonly label: string;
    readonly input: MergeTabInput;
}

interface TabChangeEvent {
    readonly opened: readonly FakeMergeTab[];
    readonly closed: readonly FakeMergeTab[];
    readonly changed: readonly FakeMergeTab[];
}

interface WillSaveEvent {
    readonly document: FakeResultDocument;
    readonly reason: TextDocumentSaveReason;
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

export class FakeResultDocument {
    private text: string;
    private dirty = true;

    constructor(
        readonly uri: Uri,
        merged: string,
    ) {
        this.text = merged;
    }

    get isDirty(): boolean {
        return this.dirty;
    }

    getText(): string {
        return this.text;
    }

    type(text: string): void {
        this.text = text;
        this.dirty = true;
    }

    revert(): void {
        this.text = readServedFile(this.uri);
        this.dirty = false;
    }

    async save(): Promise<boolean> {
        saveDocument(this, TextDocumentSaveReason.Manual);
        return true;
    }
}

const fileSystems = new Map<string, ServedFileSystem>();
const documents: FakeResultDocument[] = [];
const tabs: FakeMergeTab[] = [];
const tabChangeListeners = new Set<Listener<TabChangeEvent>>();
const willSaveListeners = new Set<Listener<WillSaveEvent>>();
const didSaveListeners = new Set<Listener<FakeResultDocument>>();
let nextOpen: "opens" | "fails" | "opensNoTab" = "opens";
let mergeOf: (start: string) => string = (start) => start;

export function resetVscodeMergeEditor(): void {
    fileSystems.clear();
    documents.length = 0;
    tabs.length = 0;
    tabChangeListeners.clear();
    willSaveListeners.clear();
    didSaveListeners.clear();
    nextOpen = "opens";
    mergeOf = (start) => start;
}

/** What the editor makes of the result's start text, as it merges the one-sided edits of a marker text. */
export function editorMergesStartTextTo(merge: (start: string) => string): void {
    mergeOf = merge;
}

/** The next `_open.mergeEditor` rejects, as on a host without the command. */
export function failNextMergeEditorOpen(): void {
    nextOpen = "fails";
}

/** The next `_open.mergeEditor` returns but no editor ever shows, as when its input fails to load. */
export function openNextMergeEditorWithoutTab(): void {
    nextOpen = "opensNoTab";
}

export function mergeTabs(): readonly FakeMergeTab[] {
    return [...tabs];
}

/** The text the merge result shows, or `undefined` when no editor holds it. */
export function mergeResultText(): string | undefined {
    return documents[0]?.getText();
}

export function typeIntoMergeResult(text: string): void {
    onlyResult().type(text);
}

export function saveMergeResult(reason: TextDocumentSaveReason): void {
    saveDocument(onlyResult(), reason);
}

export function revertMergeResult(): void {
    onlyResult().revert();
}

/** Plays Split Editor on the merge tab: a second tab over the same result. */
export function splitMergeTab(): void {
    const [tab] = tabs;
    if (!tab) throw new Error("No merge tab is open.");
    addTab({ label: tab.label, input: tab.input });
}

/** The user closes a merge tab and answers Don't Save if VS Code asks. */
export function closeMergeTabByUser(index = 0): void {
    const tab = tabs[index];
    if (!tab) throw new Error(`No merge tab at ${index}.`);
    removeTabs([tab]);
}

function onlyResult(): FakeResultDocument {
    const [document] = documents;
    if (!document) throw new Error("No merge result is open.");
    return document;
}

function saveDocument(document: FakeResultDocument, reason: TextDocumentSaveReason): void {
    willSaveListeners.forEach((listener) => listener({ document, reason }));
    fileSystemFor(document.uri).writeFile(
        document.uri,
        new TextEncoder().encode(document.getText()),
        { create: true, overwrite: true },
    );
    document.revert();
    didSaveListeners.forEach((listener) => listener(document));
}

function fileSystemFor(uri: Uri): ServedFileSystem {
    const fileSystem = fileSystems.get(uri.scheme);
    if (!fileSystem) throw new Error(`No file system serves ${uri.scheme}:.`);
    return fileSystem;
}

function readServedFile(uri: Uri): string {
    return new TextDecoder().decode(fileSystemFor(uri).readFile(uri));
}

function subscribe<T>(listeners: Set<Listener<T>>, listener: Listener<T>): Disposable {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
}

function addTab(tab: FakeMergeTab): void {
    tabs.push(tab);
    tabChangeListeners.forEach((listener) => listener({ opened: [tab], closed: [], changed: [] }));
}

function removeTabs(closing: readonly FakeMergeTab[]): void {
    const closed = closing.filter((tab) => tabs.includes(tab));
    for (const tab of closed) tabs.splice(tabs.indexOf(tab), 1);
    if (!tabs.some((tab) => documents.some((document) => isShownIn(document, tab)))) {
        documents.length = 0;
    }
    tabChangeListeners.forEach((listener) => listener({ opened: [], closed, changed: [] }));
}

function isShownIn(document: FakeResultDocument, tab: FakeMergeTab): boolean {
    return tab.input.result.toString() === document.uri.toString();
}

function openMergeEditor(args: MergeEditorArgs): void {
    const opening = nextOpen;
    nextOpen = "opens";
    if (opening === "fails") throw new Error("command '_open.mergeEditor' not found");
    [args.base, args.input1.uri, args.input2.uri].forEach(readServedFile);
    if (opening === "opensNoTab") return;
    documents.push(new FakeResultDocument(args.output, mergeOf(readServedFile(args.output))));
    addTab({
        label: `Merging: ${args.output.path.split("/").pop() ?? ""}`,
        input: {
            base: args.base,
            input1: args.input1.uri,
            input2: args.input2.uri,
            result: args.output,
        },
    });
}

export const workspace = {
    get textDocuments(): readonly FakeResultDocument[] {
        return [...documents];
    },
    registerFileSystemProvider(scheme: string, provider: ServedFileSystem): Disposable {
        fileSystems.set(scheme, provider);
        return { dispose: () => fileSystems.delete(scheme) };
    },
    onWillSaveTextDocument(listener: Listener<WillSaveEvent>): Disposable {
        return subscribe(willSaveListeners, listener);
    },
    onDidSaveTextDocument(listener: Listener<FakeResultDocument>): Disposable {
        return subscribe(didSaveListeners, listener);
    },
};

export const window = {
    tabGroups: {
        get all(): { tabs: readonly FakeMergeTab[] }[] {
            return [{ tabs: [...tabs] }];
        },
        // VS Code asks to save a dirty result instead; a spec must never get there.
        async close(tabOrTabs: FakeMergeTab | readonly FakeMergeTab[]): Promise<boolean> {
            const closing = (Array.isArray(tabOrTabs) ? tabOrTabs : [tabOrTabs]) as FakeMergeTab[];
            if (documents.some((document) => document.isDirty)) {
                throw new Error("VS Code asked whether to save the merge result.");
            }
            removeTabs(closing);
            return true;
        },
        onDidChangeTabs(listener: Listener<TabChangeEvent>): Disposable {
            return subscribe(tabChangeListeners, listener);
        },
    },
};

export const commands = {
    async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
        if (command !== "_open.mergeEditor") throw new Error(`command '${command}' not found`);
        openMergeEditor(args[0] as MergeEditorArgs);
        return undefined;
    },
};
