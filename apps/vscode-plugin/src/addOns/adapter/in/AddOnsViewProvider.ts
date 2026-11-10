import {
    CancellationToken,
    commands,
    ExtensionContext,
    Uri,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    window,
} from "vscode";

import { AddOnsFeature } from "@miragon/bpmn-modeler-core";
import { BrandModeQuery, Command, Query } from "@miragon/bpmn-modeler-shared";
import { addOnsViewHtml } from "./AddOnsViewHtml";
import type { VsCodeBrandModeSignal } from "./VsCodeBrandModeSignal";

/** The Artifacts view; users see the id in keybindings and in "Focus on Artifacts View". */
export const ADD_ONS_VIEW_ID = "bpmn-modeler.artifactsView";

export const REFRESH_ADD_ONS_CMD = "bpmn-modeler.refreshArtifacts";

/**
 * The Artifacts view in the BPMN Modeler container and its title bar's
 * refresh. Host glue only: the core's {@link AddOnsFeature} builds the
 * catalog, answers the page and refreshes when the view is shown again.
 */
export class AddOnsViewProvider implements WebviewViewProvider {
    private pageLoaded = false;
    private focusOnLoad = false;

    constructor(
        private readonly addOns: AddOnsFeature,
        private readonly extensionUri: Uri,
        private readonly createNonce: () => string,
        private readonly brandMode: Pick<VsCodeBrandModeSignal, "current" | "onDidChange">,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            // Kept while hidden: the core posts nothing then, and a shown page keeps its banners.
            window.registerWebviewViewProvider(ADD_ONS_VIEW_ID, this, {
                webviewOptions: { retainContextWhenHidden: true },
            }),
            commands.registerCommand(REFRESH_ADD_ONS_CMD, () => this.addOns.refresh()),
        );
    }

    /** Opens the container, resolves the view if needed and focuses it. */
    async focus(): Promise<void> {
        await commands.executeCommand(`${ADD_ONS_VIEW_ID}.focus`);
        // A page still loading loses that focus, so the view takes it again once the page runs.
        if (!this.pageLoaded) this.focusOnLoad = true;
    }

    resolveWebviewView(
        webviewView: WebviewView,
        _context: WebviewViewResolveContext,
        _token: CancellationToken,
    ): void {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [Uri.joinPath(this.extensionUri, "add-ons-webview")],
        };
        webviewView.webview.html = addOnsViewHtml(
            webviewView.webview,
            this.extensionUri,
            this.createNonce(),
            this.brandMode.current(),
        );

        const panel = this.addOns.attachPanel(
            (message: Query) => void webviewView.webview.postMessage(message),
            webviewView.visible,
        );
        // VS Code never renders the shell again, so the page follows a theme change by message.
        const brandModeChanges = this.brandMode.onDidChange(
            (mode) => void webviewView.webview.postMessage(new BrandModeQuery(mode)),
        );
        webviewView.onDidDispose(() => {
            this.pageLoaded = false;
            this.focusOnLoad = false;
            brandModeChanges.dispose();
            panel.dispose();
        });
        webviewView.webview.onDidReceiveMessage((message: Command) => {
            this.pageLoaded = true;
            if (this.focusOnLoad) {
                this.focusOnLoad = false;
                webviewView.show(false);
            }
            return panel.handle(message);
        });
        webviewView.onDidChangeVisibility(() => panel.setVisible(webviewView.visible));
    }
}
