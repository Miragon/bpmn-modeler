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

import { DeploymentMessageDispatcher } from "@miragon/bpmn-modeler-core";
import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { DeploymentService } from "@miragon/bpmn-modeler-core";
import { StartInstanceService } from "@miragon/bpmn-modeler-core";
import { Command, Query } from "@miragon/bpmn-modeler-shared";
import { deploymentWebviewHtml } from "../infrastructure/DeploymentWebviewHtml";
import { VsCodeDocument } from "../../shared/infrastructure/VsCodeDocument";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { getContext } from "../../shared/infrastructure/extensionContext";

// VS Code view ID for the deployment sidebar WebviewView.
const DEPLOYMENT_VIEW_ID = "bpmn-modeler.deploymentView";

// VS Code command ID for triggering the deployment panel.
export const DEPLOY_CMD = "bpmn-modeler.deployDiagram";

/**
 * Registers and manages the deployment sidebar WebviewView and the
 * `bpmn-modeler.deployDiagram` command.
 *
 * Host glue only: it owns the VS Code `WebviewView` lifecycle and forwards the
 * deployment message protocol to the host-agnostic
 * {@link DeploymentMessageDispatcher}, which carries all the deploy/start-instance
 * logic shared with the IntelliJ bridge. The only VS Code-specific seam is the
 * `post` callback (`webview.postMessage`) and the visibility/active-editor wiring.
 */
export class DeploymentController implements WebviewViewProvider {
    /**
     * @param editorStore Central registry for active editor state.
     * @param vsDocument Document read/write operations for resolving file paths.
     * @param deploymentService Deployment orchestration logic.
     * @param startInstanceService Start-instance orchestration logic.
     * @param notifier User-facing message and logging helper.
     */
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: VsCodeDocument,
        private readonly deploymentService: DeploymentService,
        private readonly startInstanceService: StartInstanceService,
        private readonly notifier: VsCodeNotifier,
    ) {}

    /**
     * Registers the WebviewViewProvider for the deployment sidebar and the
     * `bpmn-modeler.deployDiagram` command with VS Code.
     *
     * @param context The VS Code extension context used to track disposables.
     */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            window.registerWebviewViewProvider(DEPLOYMENT_VIEW_ID, this, {
                webviewOptions: { retainContextWhenHidden: true },
            }),
            commands.registerCommand(DEPLOY_CMD, () => this.openDeploymentPanel()),
        );
    }

    /**
     * Called by VS Code when the deployment sidebar panel becomes visible.
     *
     * Builds the per-view dispatcher (its `post` targets this view's webview),
     * routes incoming messages to it, and re-pushes form defaults whenever the
     * panel is re-shown or the active editor changes.
     *
     * @param webviewView The WebviewView provided by VS Code.
     * @param _context Resolve context (unused).
     * @param _token Cancellation token (unused).
     */
    resolveWebviewView(
        webviewView: WebviewView,
        _context: WebviewViewResolveContext,
        _token: CancellationToken,
    ): void {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [Uri.joinPath(getContext().extensionUri, "deployment-webview")],
        };

        webviewView.webview.html = deploymentWebviewHtml(
            webviewView.webview,
            getContext().extensionUri,
        );

        const dispatcher = new DeploymentMessageDispatcher(
            this.editorStore,
            this.vsDocument,
            this.deploymentService,
            this.startInstanceService,
            this.notifier,
            (message: Query) => void webviewView.webview.postMessage(message),
        );

        // The dispatcher catches every handler error internally, so returning its
        // promise here is safe (no floating rejection) and lets the host await it.
        webviewView.webview.onDidReceiveMessage((message: Command) => dispatcher.handle(message));

        // Re-send defaults whenever the panel becomes visible again (e.g. user
        // switches back to the activity-bar tab).
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                dispatcher.sendFormDefaults();
            }
        });

        // Re-send defaults when the user switches between editor tabs while the
        // deployment panel is already visible.
        this.editorStore.onDidChangeActiveEditor(() => {
            if (webviewView.visible) {
                dispatcher.sendFormDefaults();
            }
        });
    }

    /**
     * Triggers {@link resolveWebviewView} if the sidebar isn't open yet.
     */
    private async openDeploymentPanel(): Promise<void> {
        await commands.executeCommand(`${DEPLOYMENT_VIEW_ID}.focus`);
    }
}
