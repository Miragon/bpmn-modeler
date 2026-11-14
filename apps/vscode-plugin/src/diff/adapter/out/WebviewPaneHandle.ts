import { TextDocument, WebviewPanel } from "vscode";

import { DiffPaneHandle, DiffRevision } from "@miragon/bpmn-modeler-core";
import {
    bootstrapWebview,
    DiffPaneSurface,
} from "../../../shared/adapter/out/bootstrapWebview";
import { revisionOfDocument } from "./documentRevision";

/**
 * Outbound adapter that wraps a real `WebviewPanel` + `TextDocument`
 * pair into the {@link DiffPaneHandle} the diff machinery uses.
 *
 * Confining the only `WebviewPanel`/`TextDocument` references to this adapter
 * is what lets {@link DiffSession}, `DiffPaneStore` and the diff services
 * stay vscode-free — they see only the abstract handle.
 */
export class WebviewPaneHandle implements DiffPaneHandle {
    private readyFlag = false;

    /** @param surface The diff-pane page the panel loads. */
    constructor(
        readonly panel: WebviewPanel,
        readonly document: TextDocument,
        private readonly surface: DiffPaneSurface,
    ) {}

    get uri(): string {
        return this.document.uri.toString();
    }

    get revision(): DiffRevision {
        return revisionOfDocument(this.document.uri);
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

    bootstrap(): void {
        bootstrapWebview(this.panel, { diffPane: this.surface });
    }
}
