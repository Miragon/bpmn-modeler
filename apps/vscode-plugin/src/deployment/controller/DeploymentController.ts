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

import { posix } from "path";

import { DeploymentMessageDispatcher } from "@miragon/bpmn-modeler-core";
import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { DeploymentService } from "@miragon/bpmn-modeler-core";
import { DeploymentTargetService } from "@miragon/bpmn-modeler-core";
import { StartInstanceService } from "@miragon/bpmn-modeler-core";
import { Command, Query } from "@miragon/bpmn-modeler-shared";
import { deploymentWebviewHtml } from "../infrastructure/DeploymentWebviewHtml";
import { VsCodeDocument } from "../../shared/infrastructure/VsCodeDocument";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { VsCodePicker } from "../../shared/infrastructure/VsCodePicker";
import { getContext } from "../../shared/infrastructure/extensionContext";

// VS Code view ID for the deployment sidebar WebviewView.
const DEPLOYMENT_VIEW_ID = "bpmn-modeler.deploymentView";

// VS Code command ID for triggering the deployment panel.
export const DEPLOY_CMD = "bpmn-modeler.deployDiagram";

// Switches the active deployment target via a QuickPick (status bar / palette).
export const SWITCH_TARGET_CMD = "bpmn-modeler.switchDeploymentTarget";

// Deploys a multi-select set of workspace BPMN/DMN files to the active target.
export const DEPLOY_FILES_CMD = "bpmn-modeler.deployFiles";

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
    // The dispatcher for the currently-resolved sidebar view, so target commands
    // triggered outside the webview (status bar, palette) can push the refreshed
    // targets/form back into an open sidebar.
    private currentDispatcher: DeploymentMessageDispatcher | undefined;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: VsCodeDocument,
        private readonly deploymentService: DeploymentService,
        private readonly startInstanceService: StartInstanceService,
        private readonly deploymentTargetService: DeploymentTargetService,
        private readonly picker: VsCodePicker,
        private readonly notifier: VsCodeNotifier,
    ) {}

    /**
     * Registers the WebviewViewProvider for the deployment sidebar and the
     * deployment commands with VS Code.
     */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            window.registerWebviewViewProvider(DEPLOYMENT_VIEW_ID, this, {
                webviewOptions: { retainContextWhenHidden: true },
            }),
            commands.registerCommand(DEPLOY_CMD, () => this.openDeploymentPanel()),
            commands.registerCommand(SWITCH_TARGET_CMD, () => this.switchTarget()),
            commands.registerCommand(DEPLOY_FILES_CMD, () => this.deployFiles()),
        );
    }

    /**
     * Called by VS Code when the deployment sidebar panel becomes visible.
     *
     * Builds the per-view dispatcher (its `post` targets this view's webview),
     * routes incoming messages to it, and re-pushes form defaults whenever the
     * panel is re-shown or the active editor changes.
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
            this.deploymentTargetService,
            this.notifier,
            (message: Query) => void webviewView.webview.postMessage(message),
        );
        this.currentDispatcher = dispatcher;
        webviewView.onDidDispose(() => {
            if (this.currentDispatcher === dispatcher) {
                this.currentDispatcher = undefined;
            }
        });

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
     * QuickPick → persist → status bar (all in the service) → refresh an open
     * sidebar so its select mirrors the new active target.
     */
    private async switchTarget(): Promise<void> {
        await this.deploymentTargetService.switchActiveTarget(this.activeDocumentDir());
        await this.currentDispatcher?.sendTargets();
    }

    /**
     * Deploys a multi-select set of workspace BPMN/DMN files to the active
     * target. With no active target, runs the switch first so the user picks one,
     * then proceeds only if a concrete target results.
     */
    private async deployFiles(): Promise<void> {
        const documentDir = this.activeDocumentDir();
        let target = await this.deploymentTargetService.getActiveTarget(documentDir);
        if (target === undefined) {
            await this.switchTarget();
            target = await this.deploymentTargetService.getActiveTarget(documentDir);
            if (target === undefined) {
                return;
            }
        }

        const files = await this.picker.pickWorkspaceFiles({
            glob: "**/*.{bpmn,dmn}",
            exclude: "**/node_modules/**",
            placeholder: `Select files to deploy to "${target.name}"`,
        });
        if (files.length === 0) {
            return;
        }

        const resolvedTarget = target;
        const auth = await this.deploymentTargetService.getCredentials(target, documentDir);
        await this.notifier.withProgress(
            `Deploying ${files.length} file(s) to "${target.name}"`,
            () => this.deploymentService.deployFiles(files, resolvedTarget, auth),
        );
    }

    private activeDocumentDir(): string | undefined {
        try {
            return posix.dirname(this.vsDocument.getFilePath(this.editorStore.getActiveEditorId()));
        } catch {
            return undefined;
        }
    }

    /**
     * Triggers {@link resolveWebviewView} if the sidebar isn't open yet.
     */
    private async openDeploymentPanel(): Promise<void> {
        await commands.executeCommand(`${DEPLOYMENT_VIEW_ID}.focus`);
    }
}
