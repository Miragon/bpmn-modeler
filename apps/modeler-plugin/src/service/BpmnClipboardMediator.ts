import { ClipboardQuery, TextClipboardQuery } from "@miragon/bpmn-modeler-shared";

import { EditorStore } from "../infrastructure/EditorStore";
import { VsCodeClipboard } from "../infrastructure/VsCodeClipboard";
import { VsCodeNotifier } from "../infrastructure/VsCodeNotifier";

/**
 * Mediates clipboard access between the webview and the system clipboard.
 *
 * VS Code sandboxed iframes lack `clipboard-read` / `clipboard-write`
 * permissions, so the extension host has to perform the actual read/write
 * and post the value back over the webview channel.
 */
export class BpmnClipboardMediator {
    constructor(
        private readonly editorStore: EditorStore,
        private readonly clipboard: VsCodeClipboard,
        private readonly notifier: VsCodeNotifier,
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
