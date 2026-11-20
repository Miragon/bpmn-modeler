/**
 * The slice of the `vscode` module VS Code's merge editor touches, for
 * `vi.mock("vscode", () => import(".../vscodeMergeEditorFake"))`:
 * `_open.mergeEditor` over files the extension serves, the editor groups and
 * their merge tabs, the result document the editor merged, its saves with
 * their reasons and the tabs closing. As in VS Code, opening a result the
 * active group already shows brings that tab to the front, and the command
 * returns while the editor still loads: the tab and the start text show
 * first, a save through the editor is dropped, and only on a later timer
 * does the editor merge a start with conflict markers into a dirty result
 * (see {@link holdMergeEditorLoading}). Call {@link resetVscodeMergeEditor}
 * before each test.
 */
import { Uri } from "./vscodeFileSystemFake";

export * from "./vscodeFileSystemFake";

export enum TextDocumentSaveReason {
    Manual = 1,
    AfterDelay = 2,
    FocusOut = 3,
}

export enum ViewColumn {
    Beside = -2,
    Active = -1,
    One = 1,
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
    readonly group: FakeTabGroup;
    /** The titles the editor shows above input1 and input2, which VS Code's tab API does not report; none on a restored tab. */
    readonly titles?: { readonly input1: string; readonly input2: string };
    /** As VS Code's merge tab: false while the editor loads, then whether its result is dirty. */
    readonly isDirty: boolean;
}

export interface FakeTabGroup {
    readonly viewColumn: number;
    readonly tabs: FakeMergeTab[];
    activeTab: FakeMergeTab | undefined;
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
    private dirty = false;

    constructor(
        readonly uri: Uri,
        start: string,
    ) {
        this.text = start;
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

const FOCUS_GROUP_COMMANDS = [
    "workbench.action.focusFirstEditorGroup",
    "workbench.action.focusSecondEditorGroup",
    "workbench.action.focusThirdEditorGroup",
    "workbench.action.focusFourthEditorGroup",
];

const fileSystems = new Map<string, ServedFileSystem>();
const documents: FakeResultDocument[] = [];
const groups: FakeTabGroup[] = [];
let activeGroup: FakeTabGroup;
const tabChangeListeners = new Set<Listener<TabChangeEvent>>();
const willSaveListeners = new Set<Listener<WillSaveEvent>>();
const didSaveListeners = new Set<Listener<FakeResultDocument>>();
const executed: string[] = [];
const registered = new Map<string, (...args: unknown[]) => unknown>();
let acceptMergeFails = false;
let nextAcceptCancelled = false;
let nextOpen: "opens" | "fails" | "opensNoTab" = "opens";
let mergeOf: (start: string) => string = (start) => start;
let commandList: string[] = [];
let groupsSplit = true;
const loadingResults = new Set<string>();
let loadingHeld = false;

export const env = { appName: "Visual Studio Code", uriScheme: "vscode" };

export function resetVscodeMergeEditor(): void {
    fileSystems.clear();
    documents.length = 0;
    groups.length = 0;
    activeGroup = addGroup();
    tabChangeListeners.clear();
    willSaveListeners.clear();
    didSaveListeners.clear();
    executed.length = 0;
    registered.clear();
    acceptMergeFails = false;
    nextAcceptCancelled = false;
    nextOpen = "opens";
    mergeOf = (start) => start;
    commandList = ["_open.mergeEditor", "mergeEditor.acceptMerge"];
    groupsSplit = true;
    loadingResults.clear();
    loadingHeld = false;
    env.appName = "Visual Studio Code";
    env.uriScheme = "vscode";
}

resetVscodeMergeEditor();

/** What the editor makes of the result's start text, as it merges the one-sided edits of a marker text. */
export function editorMergesStartTextTo(merge: (start: string) => string): void {
    mergeOf = merge;
}

/** Merge editors opened from now on keep loading until {@link finishMergeEditorLoading}, as on a busy machine. */
export function holdMergeEditorLoading(): void {
    loadingHeld = true;
}

/** Every loading merge editor finishes: it merges a start with conflict markers, and a save reaches it. */
export function finishMergeEditorLoading(): void {
    loadingHeld = false;
    for (const result of [...loadingResults]) finishLoading(result);
}

/** The next `_open.mergeEditor` rejects, as on a host without the command. */
export function failNextMergeEditorOpen(): void {
    nextOpen = "fails";
}

/** The next `_open.mergeEditor` returns but no editor ever shows, as when its input fails to load. */
export function openNextMergeEditorWithoutTab(): void {
    nextOpen = "opensNoTab";
}

/** What `commands.getCommands` lists; the merge editor's commands by default. */
export function listCommands(list: readonly string[]): void {
    commandList = [...list];
}

/** `workbench.action.newGroupBelow` fails, as on Theia. */
export function failToSplitGroups(): void {
    groupsSplit = false;
}

/** `mergeEditor.acceptMerge` rejects, as when no merge editor has the focus. */
export function failAcceptMerge(): void {
    acceptMergeFails = true;
}

/** The user answers Cancel when the next `mergeEditor.acceptMerge` asks to complete with conflicts. */
export function cancelNextAccept(): void {
    nextAcceptCancelled = true;
}

/** Runs a command the extension registered, as a title button or the palette does. */
export function runRegisteredCommand(command: string): unknown {
    const callback = registered.get(command);
    if (!callback) throw new Error(`command '${command}' not registered`);
    return callback();
}

/** Every command run through `commands.executeCommand`, in order. */
export function executedCommands(): readonly string[] {
    return [...executed];
}

/** Restores a merge tab from the last session, whose result the extension does not serve: clean and unread, as VS Code brings it back. */
export function restoreMergeTabFromLastSession(result: Uri): void {
    addTab(activeGroup, {
        label: `Merging: ${result.path.split("/").pop() ?? ""}`,
        input: { base: result, input1: result, input2: result, result },
    });
}

export function mergeTabs(): readonly FakeMergeTab[] {
    return groups.flatMap((group) => group.tabs);
}

export function editorGroups(): readonly FakeTabGroup[] {
    return [...groups];
}

/** The tab in front of the active group, if any. */
export function activeMergeTab(): FakeMergeTab | undefined {
    return activeGroup.activeTab;
}

/** The text the merge result shows, or `undefined` when no editor holds it. */
export function mergeResultText(elementId?: string): string | undefined {
    return (elementId === undefined ? documents[0] : documentOf(elementId))?.getText();
}

/** Every merge result an editor shows, by its element. */
export function mergeResultTexts(): Record<string, string> {
    return Object.fromEntries(
        documents.map((document) => [elementIdOf(document.uri), document.getText()]),
    );
}

export function typeIntoMergeResult(text: string, elementId?: string): void {
    resultOf(elementId).type(text);
}

/** A save through the merge editor, which VS Code drops while the editor loads. */
export function saveMergeResult(reason: TextDocumentSaveReason, elementId?: string): void {
    const document = resultOf(elementId);
    if (loadingResults.has(document.uri.toString())) return;
    saveDocument(document, reason);
}

export function revertMergeResult(): void {
    resultOf(undefined).revert();
}

/** Plays Split Editor on the merge tab: a second tab over the same result. */
export function splitMergeTab(): void {
    const [tab] = mergeTabs();
    if (!tab) throw new Error("No merge tab is open.");
    addTab(tab.group, { label: tab.label, input: tab.input });
}

/** The user closes a merge tab and answers Don't Save if VS Code asks. */
export function closeMergeTabByUser(index = 0): void {
    const tab = mergeTabs()[index];
    if (!tab) throw new Error(`No merge tab at ${index}.`);
    removeTabs([tab]);
}

/** The user closes every tab of the merge of `elementId`, answering Don't Save. */
export function closeMergeTabsOfByUser(elementId: string): void {
    removeTabs(mergeTabs().filter((tab) => elementIdOf(tab.input.result) === elementId));
}

/** The user focuses the group `index`, as a click into it does. */
export function focusGroupByUser(index: number): void {
    const group = groups[index];
    if (!group) throw new Error(`No editor group at ${index}.`);
    activeGroup = group;
}

function elementIdOf(result: Uri): string {
    return (result.path.split("/").pop() ?? "").replace(/\.xml$/, "");
}

function documentOf(elementId: string): FakeResultDocument | undefined {
    return documents.find((document) => elementIdOf(document.uri) === elementId);
}

function resultOf(elementId: string | undefined): FakeResultDocument {
    const document = elementId === undefined ? documents[0] : documentOf(elementId);
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

function addGroup(): FakeTabGroup {
    const group: FakeTabGroup = { viewColumn: groups.length + 1, tabs: [], activeTab: undefined };
    groups.push(group);
    return group;
}

function addTab(group: FakeTabGroup, tab: Omit<FakeMergeTab, "group" | "isDirty">): void {
    const added: FakeMergeTab = {
        ...tab,
        group,
        get isDirty() {
            const result = tab.input.result.toString();
            if (loadingResults.has(result)) return false;
            return documents.some(
                (document) => document.uri.toString() === result && document.isDirty,
            );
        },
    };
    group.tabs.push(added);
    group.activeTab = added;
    tabChangeListeners.forEach((listener) =>
        listener({ opened: [added], closed: [], changed: [] }),
    );
}

function removeTabs(closing: readonly FakeMergeTab[]): void {
    const closed = closing.filter((tab) => tab.group.tabs.includes(tab));
    for (const tab of closed) {
        tab.group.tabs.splice(tab.group.tabs.indexOf(tab), 1);
        if (tab.group.activeTab === tab) tab.group.activeTab = tab.group.tabs.at(-1);
    }
    const shown = documents.filter((document) =>
        mergeTabs().some((tab) => isShownIn(document, tab)),
    );
    documents.splice(0, documents.length, ...shown);
    tabChangeListeners.forEach((listener) => listener({ opened: [], closed, changed: [] }));
}

// As VS Code's `WorkspaceMergeEditorModeFactory`: a start with a line starting with `<<<<<<<` is
// replaced by the editor's own merge, and the tab reports dirty only once the editor resolved.
function finishLoading(result: string): void {
    if (!loadingResults.delete(result)) return;
    const document = documents.find((shown) => shown.uri.toString() === result);
    if (!document) return;
    if (/^<<<<<<</m.test(document.getText())) document.type(mergeOf(document.getText()));
    const changed = mergeTabs().filter((tab) => tab.input.result.toString() === result);
    tabChangeListeners.forEach((listener) => listener({ opened: [], closed: [], changed }));
}

function isShownIn(document: FakeResultDocument, tab: FakeMergeTab): boolean {
    return tab.input.result.toString() === document.uri.toString();
}

// As VS Code's accept: an unforced save, which writes nothing for a clean result, then the close.
function acceptActiveMerge(): void {
    const cancelled = nextAcceptCancelled;
    nextAcceptCancelled = false;
    const tab = activeGroup.activeTab;
    if (cancelled || !tab) return;
    const result = documents.find((document) => isShownIn(document, tab));
    if (result?.isDirty) saveDocument(result, TextDocumentSaveReason.Manual);
    removeTabs([tab]);
}

function openMergeEditor(args: MergeEditorArgs): void {
    const opening = nextOpen;
    nextOpen = "opens";
    if (opening === "fails") throw new Error("command '_open.mergeEditor' not found");
    [args.base, args.input1.uri, args.input2.uri].forEach(readServedFile);
    if (opening === "opensNoTab") return;
    const shownHere = activeGroup.tabs.find(
        (tab) => tab.input.result.toString() === args.output.toString(),
    );
    if (shownHere) {
        activeGroup.activeTab = shownHere;
        return;
    }
    if (!documents.some((document) => document.uri.toString() === args.output.toString())) {
        documents.push(new FakeResultDocument(args.output, readServedFile(args.output)));
        loadingResults.add(args.output.toString());
        setTimeout(() => {
            if (!loadingHeld) finishLoading(args.output.toString());
        }, 0);
    }
    addTab(activeGroup, {
        label: `Merging: ${args.output.path.split("/").pop() ?? ""}`,
        input: {
            base: args.base,
            input1: args.input1.uri,
            input2: args.input2.uri,
            result: args.output,
        },
        titles: { input1: args.input1.title, input2: args.input2.title },
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
        get all(): readonly FakeTabGroup[] {
            return [...groups];
        },
        get activeTabGroup(): FakeTabGroup {
            return activeGroup;
        },
        // VS Code asks to save a dirty result instead; a spec must never get there.
        async close(tabOrTabs: FakeMergeTab | readonly FakeMergeTab[]): Promise<boolean> {
            const closing = (Array.isArray(tabOrTabs) ? tabOrTabs : [tabOrTabs]) as FakeMergeTab[];
            const dirty = documents.filter((document) => document.isDirty);
            if (closing.some((tab) => dirty.some((document) => isShownIn(document, tab)))) {
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
        executed.push(command);
        if (command === "_open.mergeEditor") {
            openMergeEditor(args[0] as MergeEditorArgs);
            return undefined;
        }
        if (command === "mergeEditor.acceptMerge") {
            if (acceptMergeFails) throw new Error("no merge editor is active");
            acceptActiveMerge();
            return undefined;
        }
        if (command === "workbench.action.newGroupBelow") {
            if (!groupsSplit) throw new Error(`command '${command}' not found`);
            activeGroup = addGroup();
            return undefined;
        }
        const focused = FOCUS_GROUP_COMMANDS.indexOf(command);
        if (focused >= 0 && groups[focused]) {
            activeGroup = groups[focused];
            return undefined;
        }
        throw new Error(`command '${command}' not found`);
    },
    async getCommands(_filterInternal?: boolean): Promise<string[]> {
        return [...commandList];
    },
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable {
        registered.set(command, callback);
        return { dispose: () => registered.delete(command) };
    },
};
