import { ClipboardQuery, TextClipboardQuery } from "@miragon/bpmn-modeler-shared";

import { ClipboardPort, NotifierPort } from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";

/**
 * Mediates clipboard access between the webview and the system clipboard.
 *
 * VS Code sandboxed iframes lack `clipboard-read` / `clipboard-write`
 * permissions, so the extension host has to perform the actual read/write
 * and post the value back over the webview channel.
 *
 * A failed read still answers, with empty text, because the webview awaits
 * every read.
 */
export class BpmnClipboardMediator {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly clipboard: ClipboardPort,
        private readonly notifier: NotifierPort,
    ) {}

    async readClipboard(editorId: string): Promise<void> {
        await this.answer(editorId, new ClipboardQuery(await this.readOrEmpty()));
    }

    async readTextClipboard(editorId: string): Promise<void> {
        await this.answer(editorId, new TextClipboardQuery(await this.readOrEmpty()));
    }

    async writeClipboard(text: string): Promise<void> {
        try {
            await this.clipboard.writeClipboard(text);
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    private async readOrEmpty(): Promise<string> {
        try {
            return await this.clipboard.readClipboard();
        } catch (error) {
            this.notifier.logError(error as Error);
            return "";
        }
    }

    private async answer(
        editorId: string,
        reply: ClipboardQuery | TextClipboardQuery,
    ): Promise<void> {
        try {
            await this.editorStore.postMessage(editorId, reply);
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }
}
