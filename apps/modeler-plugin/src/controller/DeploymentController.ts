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

import { BasicAuth, DeploymentConfigBuilder, NoAuth, OAuth2Auth } from "../domain/deployment";
import { InvalidDeploymentConfigError } from "../domain/errors";
import { deploymentWebviewHtml } from "../infrastructure/DeploymentWebviewHtml";
import { EditorStore } from "../infrastructure/EditorStore";
import { VsCodeDocument } from "../infrastructure/VsCodeDocument";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { DeploymentService } from "../service/DeploymentService";
import { StartInstanceService } from "../service/StartInstanceService";
import { getContext } from "../infrastructure/extensionContext";
import {
    AdditionalFilesQuery,
    Command,
    DeployCommand,
    DeploymentResultQuery,
    FormDefaultsQuery,
    ProcessDefinitionKeyQuery,
    SelectedPayloadFileQuery,
    StartInstanceCommand,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
} from "@miragon/bpmn-modeler-shared";

// VS Code view ID for the deployment sidebar WebviewView.
const DEPLOYMENT_VIEW_ID = "bpmn-modeler.deploymentView";

// VS Code command ID for triggering the deployment panel.
const DEPLOY_CMD = "bpmn-modeler.deployDiagram";

/**
 * Registers and manages the deployment sidebar WebviewView and the
 * `bpmn-modeler.deployDiagram` command.
 *
 * Implements `WebviewViewProvider` so VS Code calls {@link resolveWebviewView}
 * when the sidebar panel becomes visible.  Bridges incoming webview messages
 * to {@link DeploymentService} and sends results back via `postMessage`.
 */
export class DeploymentController implements WebviewViewProvider {
    // The resolved webview view instance; `undefined` until first reveal.
    private view: WebviewView | undefined;

    /**
     * @param editorStore Central registry for active editor state.
     * @param vsDocument Document read/write operations for resolving file paths.
     * @param deploymentService Deployment orchestration logic.
     * @param startInstanceService Start-instance orchestration logic.
     * @param vsUI User-facing message and logging helper.
     */
    constructor(
        private readonly editorStore: EditorStore,
        private readonly vsDocument: VsCodeDocument,
        private readonly deploymentService: DeploymentService,
        private readonly startInstanceService: StartInstanceService,
        private readonly vsUI: VsCodeUI,
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
     * Sets up the webview HTML, configures message routing, and subscribes to
     * visibility changes so the form is always refreshed with the current
     * editor's defaults when the panel is re-shown.
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
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [Uri.joinPath(getContext().extensionUri, "deployment-webview")],
        };

        webviewView.webview.html = deploymentWebviewHtml(
            webviewView.webview,
            getContext().extensionUri,
        );

        this.subscribeToMessages(webviewView);

        // Re-send defaults whenever the panel becomes visible again (e.g. user
        // switches back to the activity-bar tab).
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.sendFormDefaults(webviewView);
            }
        });

        // Re-send defaults when the user switches between editor tabs while the
        // deployment panel is already visible.
        this.editorStore.onDidChangeActiveEditor(() => {
            if (webviewView.visible) {
                this.sendFormDefaults(webviewView);
            }
        });
    }

    /**
     * Triggers {@link resolveWebviewView} if the sidebar isn't open yet.
     */
    private async openDeploymentPanel(): Promise<void> {
        await commands.executeCommand(`${DEPLOYMENT_VIEW_ID}.focus`);
    }

    /**
     * Sends pre-populated form defaults for the currently active editor to
     * the deployment webview.
     *
     * @param webviewView The target WebviewView.
     */
    private sendFormDefaults(webviewView: WebviewView): void {
        try {
            const activeEditorId = this.editorStore.getActiveEditorId();
            const defaults = this.deploymentService.getFormDefaults(activeEditorId);
            webviewView.webview.postMessage(new FormDefaultsQuery(defaults));

            // Also send the process definition key for the Start Instance tab.
            try {
                const key = this.startInstanceService.getProcessDefinitionKey(activeEditorId);
                webviewView.webview.postMessage(new ProcessDefinitionKeyQuery(key));
            } catch {
                // Process key extraction failed — send empty key.
                webviewView.webview.postMessage(new ProcessDefinitionKeyQuery(""));
            }
        } catch {
            // No active editor — send empty defaults.
            webviewView.webview.postMessage(
                new FormDefaultsQuery({
                    deploymentName: "",
                    tenantId: "",
                    endpoint: "http://localhost:8080/engine-rest",
                    engine: "c7",
                    authType: "none",
                }),
            );
            webviewView.webview.postMessage(new ProcessDefinitionKeyQuery(""));
        }
    }

    /**
     * Subscribes to messages received from the deployment webview and routes
     * them to the appropriate handler.
     *
     * @param webviewView The WebviewView whose messages to listen to.
     */
    private subscribeToMessages(webviewView: WebviewView): void {
        webviewView.webview.onDidReceiveMessage(async (message: Command) => {
            this.vsUI.logInfo(`Deployment message received -> ${message.type}`);
            switch (message.type) {
                case "RequestFormDefaultsCommand":
                    this.sendFormDefaults(webviewView);
                    break;
                case "RequestStoredCredentialsCommand":
                    await this.handleStoredCredentialsRequest(webviewView);
                    break;
                case "RequestAdditionalFilesCommand":
                    await this.handleAdditionalFilesRequest(webviewView);
                    break;
                case "DeployCommand":
                    await this.handleDeploy(webviewView, (message as DeployCommand).config);
                    break;
                case "RequestProcessDefinitionKeyCommand":
                    this.handleProcessDefinitionKeyRequest(webviewView);
                    break;
                case "RequestPayloadFilesCommand":
                    await this.handlePayloadFilesRequest(webviewView);
                    break;
                case "StartInstanceCommand":
                    await this.handleStartInstance(
                        webviewView,
                        (message as StartInstanceCommand).config,
                    );
                    break;
            }
        });
    }

    /**
     * Retrieves stored credentials from the secret store and sends them
     * to the webview so it can pre-fill the auth fields.
     *
     * @param webviewView The target WebviewView.
     */
    private async handleStoredCredentialsRequest(webviewView: WebviewView): Promise<void> {
        try {
            const auth = await this.deploymentService.getStoredCredentials();
            webviewView.webview.postMessage(new StoredCredentialsQuery(auth));
        } catch (error) {
            this.vsUI.logError(error instanceof Error ? error : new Error(String(error)));
            webviewView.webview.postMessage(new StoredCredentialsQuery({ authType: "none" }));
        }
    }

    /**
     * Opens the VS Code QuickPick for selecting additional deployment files
     * and sends the selected paths back to the webview.
     *
     * @param webviewView The target WebviewView.
     */
    private async handleAdditionalFilesRequest(webviewView: WebviewView): Promise<void> {
        try {
            const filePaths = await this.deploymentService.selectAdditionalFiles();
            webviewView.webview.postMessage(new AdditionalFilesQuery(filePaths));
        } catch (error) {
            this.vsUI.logError(error instanceof Error ? error : new Error(String(error)));
            webviewView.webview.postMessage(new AdditionalFilesQuery([]));
        }
    }

    /**
     * Extracts the process definition key from the active BPMN file and sends
     * it to the webview.
     *
     * @param webviewView The target WebviewView.
     */
    private handleProcessDefinitionKeyRequest(webviewView: WebviewView): void {
        try {
            const activeEditorId = this.editorStore.getActiveEditorId();
            const key = this.startInstanceService.getProcessDefinitionKey(activeEditorId);
            webviewView.webview.postMessage(new ProcessDefinitionKeyQuery(key));
        } catch (error) {
            this.vsUI.logError(error instanceof Error ? error : new Error(String(error)));
            webviewView.webview.postMessage(new ProcessDefinitionKeyQuery(""));
        }
    }

    /**
     * Opens the VS Code QuickPick for selecting a payload file and sends
     * the result back to the webview.
     *
     * @param webviewView The target WebviewView.
     */
    private async handlePayloadFilesRequest(webviewView: WebviewView): Promise<void> {
        try {
            const activeEditorId = this.editorStore.getActiveEditorId();
            const result = await this.startInstanceService.selectPayloadFile(activeEditorId);
            if (result) {
                webviewView.webview.postMessage(
                    new SelectedPayloadFileQuery(result.filePath, result.label),
                );
            } else {
                webviewView.webview.postMessage(new SelectedPayloadFileQuery("", ""));
            }
        } catch (error) {
            this.vsUI.logError(error instanceof Error ? error : new Error(String(error)));
            webviewView.webview.postMessage(new SelectedPayloadFileQuery("", ""));
        }
    }

    /**
     * Builds the start-instance config from the webview payload, runs the request,
     * shows a VS Code notification, and sends the result back to the webview.
     *
     * @param webviewView The target WebviewView.
     * @param configPayload Raw start-instance config from the webview form.
     */
    private async handleStartInstance(
        webviewView: WebviewView,
        configPayload: StartInstanceCommand["config"],
    ): Promise<void> {
        try {
            const authPayload = configPayload.auth;
            let auth;
            if (authPayload.authType === "basic") {
                auth = new BasicAuth(authPayload.username ?? "", authPayload.password ?? "");
            } else if (authPayload.authType === "oauth2") {
                auth = new OAuth2Auth(
                    authPayload.clientId ?? "",
                    authPayload.clientSecret ?? "",
                    authPayload.tokenEndpoint ?? "",
                    authPayload.audience ?? "",
                );
            } else {
                auth = new NoAuth();
            }

            const result = await this.startInstanceService.startInstance(
                configPayload.processDefinitionKey,
                configPayload.endpoint,
                configPayload.engine,
                auth,
                configPayload.payloadFilePath,
            );

            if (result.success) {
                this.vsUI.showInfo(result.message);
            } else {
                this.vsUI.showError(result.message);
            }

            webviewView.webview.postMessage(
                new StartInstanceResultQuery(
                    result.success,
                    result.message,
                    result.processInstanceId,
                ),
            );
        } catch (error) {
            const message = "An unexpected error occurred while starting the process instance.";
            this.vsUI.logError(error instanceof Error ? error : new Error(String(error)));
            this.vsUI.showError(message);
            webviewView.webview.postMessage(new StartInstanceResultQuery(false, message));
        }
    }

    /**
     * Validates the incoming payload, runs the deployment, shows a VS Code
     * notification, and sends the result back to the webview.
     *
     * @param webviewView The target WebviewView.
     * @param configPayload Raw deployment config from the webview form.
     */
    private async handleDeploy(
        webviewView: WebviewView,
        configPayload: DeployCommand["config"],
    ): Promise<void> {
        try {
            const authPayload = configPayload.auth;
            let auth;
            if (authPayload.authType === "basic") {
                auth = new BasicAuth(authPayload.username ?? "", authPayload.password ?? "");
            } else if (authPayload.authType === "oauth2") {
                auth = new OAuth2Auth(
                    authPayload.clientId ?? "",
                    authPayload.clientSecret ?? "",
                    authPayload.tokenEndpoint ?? "",
                    authPayload.audience ?? "",
                );
            } else {
                auth = new NoAuth();
            }

            const activeEditorId = this.editorStore.getActiveEditorId();
            const mainFilePath = this.vsDocument.getFilePath(activeEditorId);

            const config = new DeploymentConfigBuilder()
                .withDeploymentName(configPayload.deploymentName)
                .withTenantId(configPayload.tenantId)
                .withEndpoint(configPayload.endpoint)
                .withEngine(configPayload.engine)
                .withMainFilePath(mainFilePath)
                .withAdditionalFilePaths(configPayload.additionalFilePaths)
                .withAuth(auth)
                .build();

            const result = await this.deploymentService.deploy(config);

            if (result.success) {
                this.vsUI.showInfo(result.message);
            } else {
                this.vsUI.showError(result.message);
            }

            webviewView.webview.postMessage(
                new DeploymentResultQuery(result.success, result.message, result.deploymentId),
            );
        } catch (error) {
            const message =
                error instanceof InvalidDeploymentConfigError
                    ? error.message
                    : "An unexpected error occurred during deployment.";

            this.vsUI.logError(error instanceof Error ? error : new Error(String(error)));
            this.vsUI.showError(message);
            webviewView.webview.postMessage(new DeploymentResultQuery(false, message));
        }
    }
}
