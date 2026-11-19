import { commands, ViewColumn, window } from "vscode";

/**
 * Splits the active group, which shows the diagrams because their pane just
 * posted. A host without the command, such as Theia, opens beside it instead.
 */
export async function groupBelowActive(): Promise<{
    viewColumn: ViewColumn;
    createdBelow: boolean;
}> {
    try {
        await commands.executeCommand("workbench.action.newGroupBelow");
        return { viewColumn: window.tabGroups.activeTabGroup.viewColumn, createdBelow: true };
    } catch {
        return { viewColumn: ViewColumn.Beside, createdBelow: false };
    }
}
