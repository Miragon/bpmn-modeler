import { ExtensionContext, Tab, window } from "vscode";

/**
 * Closes the tabs of documents the extension no longer serves: those a reload
 * restored, at once, and those Reopen Closed Editor or the editor history
 * bring back, as they open.
 */
export function closeUnservedTabs(
    context: ExtensionContext,
    isUnserved: (tab: Tab) => boolean,
): void {
    const close = (tabs: readonly Tab[]) => {
        const unserved = tabs.filter(isUnserved);
        if (unserved.length > 0) void window.tabGroups.close(unserved, true);
    };
    context.subscriptions.push(window.tabGroups.onDidChangeTabs((event) => close(event.opened)));
    close(window.tabGroups.all.flatMap((group) => group.tabs));
}
