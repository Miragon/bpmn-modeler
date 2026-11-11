import { TextDocument, WebviewPanel } from "vscode";

import { BPMN_VIEW_TYPE, DiffPaneHandle } from "@miragon/bpmn-modeler-core";
import { bootstrapWebview } from "../../../shared/adapter/out/bootstrapWebview";

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

    /** @param viewType The custom editor whose page the pane loads, in its diff-pane form. */
    constructor(
        readonly panel: WebviewPanel,
        readonly document: TextDocument,
        private readonly viewType: string = BPMN_VIEW_TYPE,
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

    bootstrap(): void {
        bootstrapWebview(this.viewType, this.panel, true, true);
    }
}
