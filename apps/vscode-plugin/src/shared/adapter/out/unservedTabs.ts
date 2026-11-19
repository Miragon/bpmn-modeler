import { ExtensionContext, Tab, window } from "vscode";

import type { LoggerPort } from "@miragon/bpmn-modeler-core";

/**
 * Closes the tabs of documents the extension no longer serves: those a reload
 * restored, at once, and those Reopen Closed Editor or the editor history
 * bring back, as they open.
 */
export function closeUnservedTabs(
    context: ExtensionContext,
    isUnserved: (tab: Tab) => boolean,
    logger: Pick<LoggerPort, "logError">,
): void {
    const close = (tabs: readonly Tab[]) => {
        const unserved = tabs.filter(isUnserved);
        if (unserved.length === 0) return;
        window.tabGroups
            .close(unserved, true)
            .then(undefined, (error: unknown) =>
                logger.logError(error instanceof Error ? error : String(error)),
            );
    };
    context.subscriptions.push(window.tabGroups.onDidChangeTabs((event) => close(event.opened)));
    close(window.tabGroups.all.flatMap((group) => group.tabs));
}
