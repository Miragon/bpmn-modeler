import { Tab, TabInputText, ViewColumn, window, workspace } from "vscode";

import { getContext } from "./extensionContext";

/**
 * Toggles a standard VS Code text editor pane alongside the modeler webview.
 *
 * Holds `isOpen` and `activeDocumentPath` so a second invocation of the
 * command closes the pane it previously opened. The tab-close listener
 * keeps `isOpen` in sync when the user closes the companion tab manually —
 * without it, a subsequent toggle would try to "close" an already-closed
 * tab and leave the state inverted.
 */
export class VsCodeTextEditor {
    private isOpen = false;

    private activeDocumentPath = "";

    constructor() {
        const changeTab = window.tabGroups.onDidChangeTabs((tabs) => {
            tabs.closed.forEach((tab) => {
                if (
                    tab.input instanceof TabInputText &&
                    tab.input.uri.path === this.activeDocumentPath
                ) {
                    this.isOpen = false;
                }
            });
        });

        getContext().subscriptions.push(changeTab);
    }

    async toggle(documentPath: string): Promise<boolean> {
        if (this.isOpen) {
            this.isOpen = await this.close(documentPath);
        } else {
            this.isOpen = await this.open(documentPath);
        }

        if (this.isOpen) {
            this.activeDocumentPath = documentPath;
        } else {
            this.activeDocumentPath = "";
        }

        return this.isOpen;
    }

    private async open(documentPath: string): Promise<boolean> {
        try {
            const textDocument = await workspace.openTextDocument(documentPath);
            await window.showTextDocument(textDocument, ViewColumn.Beside);
            return true;
        } catch {
            return false;
        }
    }

    private async close(documentPath: string): Promise<boolean> {
        const tab = this.getTab(documentPath);

        if (tab) {
            return !window.tabGroups.close(tab);
        } else {
            return false;
        }
    }

    private getTab(documentPath: string): Tab | undefined {
        for (const tabGroup of window.tabGroups.all) {
            for (const tab of tabGroup.tabs) {
                if (tab.input instanceof TabInputText && tab.input.uri.path === documentPath) {
                    return tab;
                }
            }
        }
        return undefined;
    }
}
