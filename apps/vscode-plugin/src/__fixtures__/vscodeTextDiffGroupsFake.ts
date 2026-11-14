/**
 * The slice of the `vscode` module that shows virtual documents in text diff
 * tabs across editor groups stacked top to bottom, for
 * `vi.mock("vscode", () => import(".../vscodeTextDiffGroupsFake"))`. It keeps
 * what the user would see: the groups, their tabs and which group has focus.
 * Call {@link resetVscodeTextDiffGroups} before each test.
 */
import { Uri } from "./vscodeFileSystemFake";

export { Uri };

export enum ViewColumn {
    Beside = -2,
}

export class TabInputTextDiff {
    constructor(
        readonly original: Uri,
        readonly modified: Uri,
    ) {}
}

/** The diagram diff's tab; the fake knows nothing more about it. */
export class TabInputCustom {
    constructor(readonly uri: Uri) {}
}

interface FakeTab {
    readonly label: string;
    readonly input: TabInputTextDiff | TabInputCustom;
    isPreview: boolean;
    readonly group: FakeTabGroup;
    readonly shownTexts: { readonly before: string; readonly after: string };
}

interface FakeTabGroup {
    viewColumn: number;
    readonly tabs: FakeTab[];
}

interface TabChangeEvent {
    readonly opened: readonly FakeTab[];
    readonly closed: readonly FakeTab[];
    readonly changed: readonly FakeTab[];
}

interface ContentProvider {
    provideTextDocumentContent(uri: Uri): string;
}

interface DiffOptions {
    readonly viewColumn?: number;
    readonly preview?: boolean;
    readonly preserveFocus?: boolean;
}

export interface RenderedTab {
    readonly label: string;
    readonly before?: string;
    readonly after?: string;
}

export interface RenderedGroup {
    readonly focused: boolean;
    readonly tabs: readonly RenderedTab[];
}

const DIAGRAM_DIFF_LABEL = "a.bpmn ↔ b.bpmn";

const groups: FakeTabGroup[] = [];
let focusedGroup: FakeTabGroup;
const contentProviders = new Map<string, ContentProvider>();
const tabListeners = new Set<(event: TabChangeEvent) => void>();
const unsupportedCommands = new Set<string>();
const closedTabs: FakeTab[] = [];
let emptyGroupsClose = true;

/** One group with focus that shows the diagram diff, as when its pane just posted. */
export function resetVscodeTextDiffGroups(): void {
    groups.length = 0;
    contentProviders.clear();
    tabListeners.clear();
    unsupportedCommands.clear();
    closedTabs.length = 0;
    emptyGroupsClose = true;
    focusedGroup = { viewColumn: 1, tabs: [] };
    groups.push(focusedGroup);
    focusedGroup.tabs.push({
        label: DIAGRAM_DIFF_LABEL,
        input: new TabInputCustom(Uri.file("/repo/b.bpmn")),
        isPreview: false,
        group: focusedGroup,
        shownTexts: { before: "", after: "" },
    });
}

/** The groups top to bottom, with what each tab shows. */
export function renderedGroups(): RenderedGroup[] {
    return groups.map((group) => ({
        focused: group === focusedGroup,
        tabs: group.tabs.map((tab) =>
            tab.input instanceof TabInputTextDiff
                ? { label: tab.label, ...tab.shownTexts }
                : { label: tab.label },
        ),
    }));
}

/** The user closes the tab labelled `label`. */
export function closeTabByUser(label: string): void {
    closeTabs([tabLabelled(label)]);
}

/** The user keeps the preview tab labelled `label` open, as a double click on it does. */
export function pinTabByUser(label: string): void {
    tabLabelled(label).isPreview = false;
}

/** A text diff tab of `scheme` that a window reload brought back, its content gone. */
export function restoreTabFromLastSession(scheme: string, label: string): void {
    const group = groups[groups.length - 1];
    group.tabs.push({
        label,
        input: new TabInputTextDiff(
            Uri.from({ scheme, path: "/old.before.xml" }),
            Uri.from({ scheme, path: "/old.after.xml" }),
        ),
        isPreview: false,
        group,
        shownTexts: { before: "", after: "" },
    });
}

/**
 * The user brings back the tab closed last, as "Reopen Closed Editor" does:
 * VS Code reads its URIs from the content provider again.
 */
export function reopenClosedTabByUser(): void {
    const closed = closedTabs.pop();
    if (!closed || !(closed.input instanceof TabInputTextDiff)) {
        throw new Error("No closed text diff tab to reopen.");
    }
    const group = groups.includes(closed.group) ? closed.group : focusedGroup;
    const { original, modified } = closed.input;
    const reopened: FakeTab = {
        ...closed,
        group,
        shownTexts: { before: readContent(original), after: readContent(modified) },
    };
    group.tabs.push(reopened);
    fireTabChange({ opened: [reopened], closed: [], changed: [] });
}

/**
 * The user drags the tab labelled `label` into the group at `groupIndex`,
 * top to bottom. VS Code opens the moved tab in that group before it closes
 * the old one.
 */
export function moveTabByUser(label: string, groupIndex: number): void {
    const tab = tabLabelled(label);
    const target = groups[groupIndex];
    const moved: FakeTab = { ...tab, group: target };
    target.tabs.push(moved);
    fireTabChange({ opened: [moved], closed: [], changed: [] });
    closeTabs([tab]);
}

/** An emptied group stays, as under `"workbench.editor.closeEmptyGroups": false`. */
export function keepEmptyGroups(): void {
    emptyGroupsClose = false;
}

/** Makes a command fail as in a host that does not know it, such as Theia. */
export function failCommand(command: string): void {
    unsupportedCommands.add(command);
}

function tabLabelled(label: string): FakeTab {
    const tab = groups.flatMap((group) => group.tabs).find((each) => each.label === label);
    if (!tab) throw new Error(`No tab labelled "${label}" is open.`);
    return tab;
}

function fireTabChange(event: TabChangeEvent): void {
    tabListeners.forEach((listener) => listener(event));
}

// An emptied group closes, as under the default `workbench.editor.closeEmptyGroups`.
function closeTabs(closing: readonly FakeTab[]): void {
    const closed = closing.filter((tab) => tab.group.tabs.includes(tab));
    for (const tab of closed) {
        tab.group.tabs.splice(tab.group.tabs.indexOf(tab), 1);
        closedTabs.push(tab);
        if (emptyGroupsClose && tab.group.tabs.length === 0 && groups.length > 1) {
            const index = groups.indexOf(tab.group);
            groups.splice(index, 1);
            if (focusedGroup === tab.group) focusedGroup = groups[Math.max(0, index - 1)];
        }
    }
    groups.forEach((group, index) => (group.viewColumn = index + 1));
    fireTabChange({ opened: [], closed, changed: [] });
}

function readContent(uri: Uri): string {
    const provider = contentProviders.get(uri.scheme);
    if (!provider) throw new Error(`No content provider serves ${uri.scheme}:.`);
    return provider.provideTextDocumentContent(uri);
}

function openDiff(original: Uri, modified: Uri, title: string, options: DiffOptions): void {
    const group =
        options.viewColumn === ViewColumn.Beside
            ? newGroupAfter(focusedGroup)
            : groups.find((candidate) => candidate.viewColumn === options.viewColumn);
    if (!group) throw new Error(`No group in view column ${String(options.viewColumn)}.`);
    const tab: FakeTab = {
        label: title,
        input: new TabInputTextDiff(original, modified),
        isPreview: options.preview === true,
        group,
        shownTexts: { before: readContent(original), after: readContent(modified) },
    };
    const replacedPreview = options.preview ? group.tabs.find((each) => each.isPreview) : undefined;
    if (replacedPreview) group.tabs.splice(group.tabs.indexOf(replacedPreview), 1, tab);
    else group.tabs.push(tab);
    if (!options.preserveFocus) focusedGroup = group;
    fireTabChange({ opened: [tab], closed: replacedPreview ? [replacedPreview] : [], changed: [] });
}

function newGroupAfter(group: FakeTabGroup): FakeTabGroup {
    const created: FakeTabGroup = { viewColumn: 0, tabs: [] };
    groups.splice(groups.indexOf(group) + 1, 0, created);
    groups.forEach((each, index) => (each.viewColumn = index + 1));
    return created;
}

export const workspace = {
    registerTextDocumentContentProvider(scheme: string, provider: ContentProvider) {
        contentProviders.set(scheme, provider);
        return { dispose: () => contentProviders.delete(scheme) };
    },
};

export const window = {
    tabGroups: {
        get all(): readonly FakeTabGroup[] {
            return [...groups];
        },
        get activeTabGroup(): FakeTabGroup {
            return focusedGroup;
        },
        async close(tabOrTabs: FakeTab | readonly FakeTab[]): Promise<boolean> {
            closeTabs(Array.isArray(tabOrTabs) ? tabOrTabs : [tabOrTabs as FakeTab]);
            return true;
        },
        onDidChangeTabs(listener: (event: TabChangeEvent) => void) {
            tabListeners.add(listener);
            return { dispose: () => tabListeners.delete(listener) };
        },
    },
};

export const commands = {
    async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
        if (unsupportedCommands.has(command)) throw new Error(`command '${command}' not found`);
        switch (command) {
            case "vscode.diff":
                openDiff(args[0] as Uri, args[1] as Uri, args[2] as string, args[3] as DiffOptions);
                return undefined;
            case "workbench.action.newGroupBelow":
                focusedGroup = newGroupAfter(focusedGroup);
                return undefined;
            case "workbench.action.focusAboveGroup":
                focusedGroup = groups[Math.max(0, groups.indexOf(focusedGroup) - 1)];
                return undefined;
            default:
                throw new Error(`command '${command}' not found`);
        }
    },
};
