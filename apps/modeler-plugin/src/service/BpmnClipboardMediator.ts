import { ClipboardQuery, TextClipboardQuery } from "@miragon/bpmn-modeler-shared";

import { ClipboardPort, NotifierPort } from "../domain/hostPorts";
import { EditorSessionStore } from "../infrastructure/EditorSessionStore";

/**
 * Mediates clipboard access between the webview and the system clipboard.
 *
 * VS Code sandboxed iframes lack `clipboard-read` / `clipboard-write`
 * permissions, so the extension host has to perform the actual read/write
 * and post the value back over the webview channel.
 */
export class BpmnClipboardMediator {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly clipboard: ClipboardPort,
        private readonly notifier: NotifierPort,
    ) {}

    async readClipboard(editorId: string): Promise<boolean> {
        try {
            const text = await this.clipboard.readClipboard();
            return await this.editorStore.postMessage(editorId, new ClipboardQuery(text));
        } catch (error) {
            this.notifier.logError(error as Error);
            return false;
        }
    }

    async readTextClipboard(editorId: string): Promise<boolean> {
        try {
            const text = await this.clipboard.readClipboard();
            return await this.editorStore.postMessage(editorId, new TextClipboardQuery(text));
        } catch (error) {
            this.notifier.logError(error as Error);
            return false;
        }
    }

    async writeClipboard(text: string): Promise<void> {
        try {
            await this.clipboard.writeClipboard(text);
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }
}
