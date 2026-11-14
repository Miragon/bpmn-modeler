import { randomUUID } from "node:crypto";

import {
    commands,
    ExtensionContext,
    Tab,
    TabGroup,
    TabInputTextDiff,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";

import { ElementXmlDiff, ElementXmlDiffView } from "@miragon/bpmn-modeler-core";

export const ELEMENT_XML_SCHEME = "bpmn-element-xml";

interface ShownElementXml {
    readonly beforeUri: Uri;
    readonly afterUri: Uri;
}

/**
 * Shows an element's XML as a native text diff of two read-only virtual
 * documents in an editor group below the diagram diff. Every element gets its
 * own URIs, so the tab title follows the element: the new diff replaces the
 * preview tab, and the previous tab is closed in case the user pinned it.
 */
export class VsCodeElementXmlDiffView implements ElementXmlDiffView {
    private readonly textsByUri = new Map<string, string>();
    private readonly shownByDiffKey = new Map<string, ShownElementXml>();
    // Outlives the tab, so a group left empty under `closeEmptyGroups: false` is reused instead of split again.
    private readonly groupByDiffKey = new Map<string, TabGroup>();
    // Serialised, so two quick selections cannot both keep a tab open.
    private pendingOperation: Promise<void> = Promise.resolve();
    // The preview tab a new diff replaces closes while it opens, which is no close by the user.
    private readonly openingDiffKeys = new Set<string>();

    /** @param onClosedByUser Told the diff key of an XML diff the user closed. */
    constructor(private readonly onClosedByUser: (diffKey: string) => void) {}

    /**
     * Whether the host tells text diff tabs apart, which a Theia version may
     * not. `window.tabGroups` itself is needed to activate the extension at all.
     */
    static isSupportedByHost(): boolean {
        return typeof TabInputTextDiff === "function";
    }

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            workspace.registerTextDocumentContentProvider(ELEMENT_XML_SCHEME, {
                provideTextDocumentContent: (uri) => this.textsByUri.get(uri.toString()) ?? "",
            }),
            window.tabGroups.onDidChangeTabs((event) => {
                this.forgetClosedTabs(event.closed);
                // Reopen Closed Editor and the editor history bring a tab back after its texts were dropped.
                this.closeUnserved(event.opened);
            }),
        );
        // A reload restores the tabs, but not the texts they showed.
        this.closeUnserved(allTabs());
    }

    private closeUnserved(tabs: readonly Tab[]): void {
        const unserved = tabs.filter((tab) => {
            const uris = elementXmlUrisOf(tab);
            return uris !== undefined && !this.textsByUri.has(uris.modified.toString());
        });
        if (unserved.length > 0) void window.tabGroups.close(unserved, true);
    }

    show(diff: ElementXmlDiff): Promise<void> {
        return this.serialised(() => this.open(diff));
    }

    refresh(diff: ElementXmlDiff): Promise<void> {
        return this.serialised(async () => {
            if (this.shownByDiffKey.has(diff.diffKey)) await this.open(diff);
        });
    }

    close(diffKey: string): Promise<void> {
        return this.serialised(async () => {
            this.groupByDiffKey.delete(diffKey);
            const shown = this.shownByDiffKey.get(diffKey);
            if (!shown) return;
            this.forget(diffKey, shown);
            const tab = tabShowing(shown);
            if (tab) await window.tabGroups.close(tab, true);
        });
    }

    private serialised(operation: () => Promise<void>): Promise<void> {
        const run = this.pendingOperation.then(operation);
        this.pendingOperation = run.catch(() => undefined);
        return run;
    }

    private async open(diff: ElementXmlDiff): Promise<void> {
        const previous = this.shownByDiffKey.get(diff.diffKey);
        const previousTab = previous && tabShowing(previous);
        const shown = this.serve(diff);

        const group = previousTab?.group ?? this.openGroupOf(diff.diffKey);
        const target = group
            ? { viewColumn: group.viewColumn, createdBelow: false }
            : await groupBelowActive();
        this.openingDiffKeys.add(diff.diffKey);
        try {
            await commands.executeCommand("vscode.diff", shown.beforeUri, shown.afterUri, diff.title, {
                viewColumn: target.viewColumn,
                preview: true,
                preserveFocus: true,
            });
        } finally {
            this.openingDiffKeys.delete(diff.diffKey);
        }
        this.shownByDiffKey.set(diff.diffKey, shown);
        const openedGroup = tabShowing(shown)?.group;
        if (openedGroup) this.groupByDiffKey.set(diff.diffKey, openedGroup);
        if (target.createdBelow) await commands.executeCommand("workbench.action.focusAboveGroup");

        if (previous) {
            this.dropTexts(previous);
            const stillOpen = tabShowing(previous);
            if (stillOpen) await window.tabGroups.close(stillOpen, true);
        }
    }

    private serve(diff: ElementXmlDiff): ShownElementXml {
        const authority = randomUUID();
        const uriFor = (side: string) =>
            Uri.from({
                scheme: ELEMENT_XML_SCHEME,
                authority,
                path: `/${diff.elementId}.${side}.xml`,
            });
        const shown = { beforeUri: uriFor("before"), afterUri: uriFor("after") };
        this.textsByUri.set(shown.beforeUri.toString(), diff.before);
        this.textsByUri.set(shown.afterUri.toString(), diff.after);
        return shown;
    }

    private openGroupOf(diffKey: string): TabGroup | undefined {
        const group = this.groupByDiffKey.get(diffKey);
        return group && window.tabGroups.all.includes(group) ? group : undefined;
    }

    // Moving a tab to another group closes it in the old one, so a closed tab whose URI is still open elsewhere stays.
    private forgetClosedTabs(closed: readonly Tab[]): void {
        for (const tab of closed) {
            const afterUri = elementXmlUrisOf(tab)?.modified.toString();
            for (const [diffKey, shown] of this.shownByDiffKey) {
                if (shown.afterUri.toString() === afterUri && !tabShowing(shown)) {
                    this.forget(diffKey, shown);
                    if (!this.openingDiffKeys.has(diffKey)) this.onClosedByUser(diffKey);
                }
            }
        }
    }

    private forget(diffKey: string, shown: ShownElementXml): void {
        this.shownByDiffKey.delete(diffKey);
        this.dropTexts(shown);
    }

    private dropTexts(shown: ShownElementXml): void {
        this.textsByUri.delete(shown.beforeUri.toString());
        this.textsByUri.delete(shown.afterUri.toString());
    }
}

/**
 * Splits the active group, which shows the diagram diff because its pane just
 * posted. A host without the command, such as Theia, opens the diff beside it.
 */
async function groupBelowActive(): Promise<{ viewColumn: ViewColumn; createdBelow: boolean }> {
    try {
        await commands.executeCommand("workbench.action.newGroupBelow");
        return { viewColumn: window.tabGroups.activeTabGroup.viewColumn, createdBelow: true };
    } catch {
        return { viewColumn: ViewColumn.Beside, createdBelow: false };
    }
}

function allTabs(): Tab[] {
    return window.tabGroups.all.flatMap((group) => group.tabs);
}

function elementXmlUrisOf(tab: Tab): TabInputTextDiff | undefined {
    return tab.input instanceof TabInputTextDiff &&
        tab.input.modified.scheme === ELEMENT_XML_SCHEME
        ? tab.input
        : undefined;
}

function tabShowing(shown: ShownElementXml): Tab | undefined {
    return allTabs().find(
        (tab) => elementXmlUrisOf(tab)?.modified.toString() === shown.afterUri.toString(),
    );
}
