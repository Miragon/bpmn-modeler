import { ExtensionContext, Uri, ViewColumn, WebviewPanel, window } from "vscode";

import type { AddOnDetailTarget, AddOnsFeature, AddOnsPanel } from "@miragon/bpmn-modeler-core";
import { Query } from "@miragon/bpmn-modeler-shared";
import { connectAddOnsPage, type BrandModeSource } from "./addOnsPageConnection";
import { addOnsViewHtml } from "./AddOnsViewHtml";

/** The tab's type; no serializer restores it, so a window reload closes it. */
export const ADD_ON_DETAIL_VIEW_TYPE = "bpmn-modeler.addOnDetail";

/**
 * One editor tab for an add-on's details, reused for the next one, as VS Code
 * shows an extension's details. Host glue only: the core's
 * {@link AddOnsFeature} answers its page as it answers the view's.
 */
export class AddOnDetailTab {
    private open?: { readonly webviewPanel: WebviewPanel; readonly panel: AddOnsPanel };
    private focusOnLoad = false;

    constructor(
        private readonly context: Pick<ExtensionContext, "subscriptions">,
        private readonly addOns: Pick<AddOnsFeature, "attachPanel">,
        private readonly extensionUri: Uri,
        private readonly createNonce: () => string,
        private readonly brandMode: BrandModeSource,
    ) {}

    show(target: AddOnDetailTarget): void {
        if (this.open === undefined) {
            this.open = this.opened(target);
            return;
        }
        this.open.webviewPanel.title = target.title;
        this.open.panel.show(target.addOnId);
        this.open.webviewPanel.reveal(undefined, false);
    }

    private opened({ addOnId, title }: AddOnDetailTarget) {
        const webviewPanel = window.createWebviewPanel(
            ADD_ON_DETAIL_VIEW_TYPE,
            title,
            { viewColumn: ViewColumn.Active, preserveFocus: false },
            {
                enableScripts: true,
                // Kept while hidden: the core posts nothing then, and a shown page keeps its banners.
                retainContextWhenHidden: true,
                localResourceRoots: [Uri.joinPath(this.extensionUri, "add-ons-webview")],
            },
        );
        webviewPanel.webview.html = addOnsViewHtml(
            webviewPanel.webview,
            this.extensionUri,
            this.createNonce(),
            this.brandMode.current(),
            "detail",
        );
        const panel = this.addOns.attachPanel(
            (message: Query) => void webviewPanel.webview.postMessage(message),
            webviewPanel.visible,
            { shows: addOnId },
        );
        // A page still loading loses the focus the new tab takes, so the tab takes it again once the page runs.
        this.focusOnLoad = true;
        const connection = connectAddOnsPage(webviewPanel.webview, panel, this.brandMode, () => {
            if (this.focusOnLoad) {
                this.focusOnLoad = false;
                webviewPanel.reveal(undefined, false);
            }
        });
        webviewPanel.onDidChangeViewState(() => panel.setVisible(webviewPanel.visible));
        webviewPanel.onDidDispose(() => {
            this.open = undefined;
            this.focusOnLoad = false;
            connection.dispose();
            panel.dispose();
        });
        this.context.subscriptions.push(webviewPanel);
        return { webviewPanel, panel };
    }
}
