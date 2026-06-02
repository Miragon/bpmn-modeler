import { TextDocument, WebviewPanel } from "vscode";

import { DiffPaneHandle } from "../domain/DiffSession";

/**
 * Infrastructure adapter that wraps a real `WebviewPanel` + `TextDocument`
 * pair into the {@link DiffPaneHandle} the diff machinery uses.
 *
 * Confining the only `WebviewPanel`/`TextDocument` references to this adapter
 * is what lets {@link DiffSession}, `DiffPaneStore`, and `BpmnDiffService`
 * stay vscode-free — they see only the abstract handle.
 */
export class WebviewPaneHandle implements DiffPaneHandle {
    private readyFlag = false;

    constructor(
        readonly panel: WebviewPanel,
        readonly document: TextDocument,
    ) {}

    get uri(): string {
        return this.document.uri.toString();
    }

    isReady(): boolean {
        return this.readyFlag;
    }

    setReady(): void {
        this.readyFlag = true;
    }

    getText(): string {
        return this.document.getText();
    }

    postMessage(msg: unknown): Promise<boolean> {
        return Promise.resolve(this.panel.webview.postMessage(msg));
    }

    dispose(): void {
        this.panel.dispose();
    }
}
