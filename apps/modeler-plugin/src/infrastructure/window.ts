import { LogOutputChannel, Tab, TabInputText, ViewColumn, window, workspace } from "vscode";

import { getContext } from "./extensionContext";

export class VsCodeTextEditor {
    private isOpen = false;

    private activeDocumentPath = "";

    constructor() {
        const changeTab = window.tabGroups.onDidChangeTabs((tabs) => {
            // Event when user closes the tab with the document
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

export class VsCodeLogger {
    private readonly prefix: string;

    private readonly logger: LogOutputChannel;

    constructor(id: string) {
        this.prefix = `[${id}] `;
        this.logger = window.createOutputChannel(id, { log: true });
        this.logger.clear();
    }

    open() {
        this.logger.show(true);
    }

    info(message: string) {
        this.logger.info(this.prefix + message);
    }

    warn(message: string) {
        this.logger.warn(this.prefix + message);
    }

    error(error: Error) {
        this.logger.error(this.prefix, error);
    }
}
