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

import { DeploymentFeature } from "@miragon/bpmn-modeler-core";
import { Command, Query } from "@miragon/bpmn-modeler-shared";
import { deploymentWebviewHtml } from "../infrastructure/DeploymentWebviewHtml";
import { getContext } from "../../shared/infrastructure/extensionContext";

// VS Code view ID for the deployment sidebar WebviewView.
const DEPLOYMENT_VIEW_ID = "bpmn-modeler.deploymentView";

// Saves and deploys the active diagram to the active target (title-bar rocket).
export const DEPLOY_CMD = "bpmn-modeler.deployDiagram";

// Switches the active deployment target via a QuickPick (status bar / palette).
export const SWITCH_TARGET_CMD = "bpmn-modeler.switchDeploymentTarget";

// Deploys a multi-select set of workspace BPMN/DMN files to the active target.
export const DEPLOY_FILES_CMD = "bpmn-modeler.deployFiles";

// Verifies the active diagram's ledger row against the target's C7 engine.
export const VERIFY_DEPLOYMENT_CMD = "bpmn-modeler.verifyDeployment";

// The status-bar item's click menu (switch target / verify); hidden from the palette.
export const DEPLOYMENT_STATUS_MENU_CMD = "bpmn-modeler.deploymentStatusMenu";

/**
 * Registers the deployment sidebar WebviewView and the deployment commands
 * (including the one-click `bpmn-modeler.deployDiagram`).
 *
 * Host glue only: the flows live in the host-agnostic {@link DeploymentFeature},
 * shared with the IntelliJ bridge. This controller owns the VS Code
 * `WebviewView` lifecycle and maps the commands onto the feature.
 */
export class DeploymentController implements WebviewViewProvider {
    constructor(private readonly deployment: DeploymentFeature) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            window.registerWebviewViewProvider(DEPLOYMENT_VIEW_ID, this, {
                webviewOptions: { retainContextWhenHidden: true },
            }),
            commands.registerCommand(DEPLOY_CMD, () => this.deployment.deployActive()),
            commands.registerCommand(SWITCH_TARGET_CMD, () => this.deployment.switchTarget()),
            commands.registerCommand(DEPLOY_FILES_CMD, () => this.deployment.deployFiles()),
            commands.registerCommand(VERIFY_DEPLOYMENT_CMD, () => this.deployment.verify()),
            commands.registerCommand(DEPLOYMENT_STATUS_MENU_CMD, () =>
                this.deployment.statusMenu(),
            ),
        );
    }

    /** Called by VS Code when the deployment sidebar panel becomes visible. */
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

        const panel = this.deployment.attachPanel(
            (message: Query) => void webviewView.webview.postMessage(message),
            webviewView.visible,
        );
        webviewView.onDidDispose(() => panel.dispose());
        // The panel catches every handler error internally, so returning its
        // promise here is safe (no floating rejection) and lets the host await it.
        webviewView.webview.onDidReceiveMessage((message: Command) => panel.handle(message));
        webviewView.onDidChangeVisibility(() => panel.setVisible(webviewView.visible));
    }
}
