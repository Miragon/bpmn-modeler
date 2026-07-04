import {
    AdditionalFilesQuery,
    Command,
    DeployCommand,
    DeploymentResultQuery,
    FormDefaultsQuery,
    ProcessDefinitionKeyQuery,
    Query,
    SelectedPayloadFileQuery,
    StartInstanceCommand,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
} from "@miragon/bpmn-modeler-shared";

import { BasicAuth, DeploymentConfigBuilder, NoAuth, OAuth2Auth } from "../domain/deployment";
import { InvalidDeploymentConfigError } from "../../shared/domain/errors";
import { DocumentPort, NotifierPort } from "../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";
import { DeploymentService } from "./DeploymentService";
import { StartInstanceService } from "./StartInstanceService";

/**
 * Host-agnostic dispatch core for the deployment webview's message protocol.
 *
 * The VS Code controller and the IntelliJ bridge both speak the *same* deployment
 * Query/Command protocol over different transports (a VS Code `WebviewView` vs. a
 * JCEF browser driven over JSON-RPC). The only thing that differs is *how* a reply
 * reaches the webview, so that — and only that — is injected as the {@link post}
 * callback; everything else (auth construction, the document-path trust gate,
 * result → notification mapping) lives here once so the two hosts can never drift.
 *
 * Trust boundary: {@link handleDeploy} resolves the main file from the active
 * editor's document, never from the webview payload, so a tampered payload can't
 * redirect which file is deployed.
 */
export class DeploymentMessageDispatcher {
    /**
     * @param editorStore Active-editor registry; resolves which document to act on.
     * @param documentPort Document path/content access for the trusted main file.
     * @param deploymentService Deployment orchestration logic.
     * @param startInstanceService Start-instance orchestration logic.
     * @param notifier User-facing message and logging helper.
     * @param post Transport sink that delivers a {@link Query} to the webview.
     */
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly documentPort: DocumentPort,
        private readonly deploymentService: DeploymentService,
        private readonly startInstanceService: StartInstanceService,
        private readonly notifier: NotifierPort,
        private readonly post: (message: Query) => void,
    ) {}

    /**
     * Routes one inbound webview {@link Command} to its handler. Unknown types are
     * ignored — the protocol is closed and a stray discriminant is not an error.
     */
    async handle(message: Command): Promise<void> {
        this.notifier.logDebug(`Deployment message received -> ${message.type}`);
        switch (message.type) {
            case "RequestFormDefaultsCommand":
                this.sendFormDefaults();
                break;
            case "RequestStoredCredentialsCommand":
                await this.handleStoredCredentialsRequest();
                break;
            case "RequestAdditionalFilesCommand":
                await this.handleAdditionalFilesRequest();
                break;
            case "DeployCommand":
                await this.handleDeploy((message as DeployCommand).config);
                break;
            case "RequestProcessDefinitionKeyCommand":
                this.handleProcessDefinitionKeyRequest();
                break;
            case "RequestPayloadFilesCommand":
                await this.handlePayloadFilesRequest();
                break;
            case "StartInstanceCommand":
                await this.handleStartInstance((message as StartInstanceCommand).config);
                break;
        }
    }

    /**
     * Re-pushes the form defaults + process-definition key for the active editor.
     * Called on panel-visible and active-editor-change so the form always reflects
     * the focused diagram.
     */
    sendFormDefaults(): void {
        try {
            const activeEditorId = this.editorStore.getActiveEditorId();
            const defaults = this.deploymentService.getFormDefaults(activeEditorId);
            this.post(new FormDefaultsQuery(defaults));

            // Also send the process definition key for the Start Instance tab.
            try {
                const key = this.startInstanceService.getProcessDefinitionKey(activeEditorId);
                this.post(new ProcessDefinitionKeyQuery(key));
            } catch {
                // Process key extraction failed — send empty key.
                this.post(new ProcessDefinitionKeyQuery(""));
            }
        } catch {
            // No active editor — send empty defaults.
            this.post(
                new FormDefaultsQuery({
                    deploymentName: "",
                    tenantId: "",
                    endpoint: "http://localhost:8080/engine-rest",
                    engine: "c7",
                    authType: "none",
                }),
            );
            this.post(new ProcessDefinitionKeyQuery(""));
        }
    }

    /**
     * Retrieves stored credentials from the secret store and sends them to the
     * webview so it can pre-fill the auth fields.
     */
    private async handleStoredCredentialsRequest(): Promise<void> {
        try {
            const auth = await this.deploymentService.getStoredCredentials();
            this.post(new StoredCredentialsQuery(auth));
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.post(new StoredCredentialsQuery({ authType: "none" }));
        }
    }

    /**
     * Opens the host file picker for selecting additional deployment files and
     * sends the selected paths back to the webview.
     */
    private async handleAdditionalFilesRequest(): Promise<void> {
        try {
            const filePaths = await this.deploymentService.selectAdditionalFiles();
            this.post(new AdditionalFilesQuery(filePaths));
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.post(new AdditionalFilesQuery([]));
        }
    }

    /**
     * Extracts the process definition key from the active BPMN file and sends it
     * to the webview.
     */
    private handleProcessDefinitionKeyRequest(): void {
        try {
            const activeEditorId = this.editorStore.getActiveEditorId();
            const key = this.startInstanceService.getProcessDefinitionKey(activeEditorId);
            this.post(new ProcessDefinitionKeyQuery(key));
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.post(new ProcessDefinitionKeyQuery(""));
        }
    }

    /**
     * Opens the host file picker for selecting a payload file and sends the result
     * back to the webview.
     */
    private async handlePayloadFilesRequest(): Promise<void> {
        try {
            const activeEditorId = this.editorStore.getActiveEditorId();
            const result = await this.startInstanceService.selectPayloadFile(activeEditorId);
            if (result) {
                this.post(new SelectedPayloadFileQuery(result.filePath, result.label));
            } else {
                this.post(new SelectedPayloadFileQuery("", ""));
            }
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.post(new SelectedPayloadFileQuery("", ""));
        }
    }

    /**
     * Builds the start-instance config from the webview payload, runs the request,
     * shows a notification, and sends the result back to the webview.
     *
     * @param configPayload Raw start-instance config from the webview form.
     */
    private async handleStartInstance(
        configPayload: StartInstanceCommand["config"],
    ): Promise<void> {
        try {
            const auth = this.buildAuth(configPayload.auth);

            const result = await this.startInstanceService.startInstance(
                configPayload.processDefinitionKey,
                configPayload.endpoint,
                configPayload.engine,
                auth,
                configPayload.payloadFilePath,
            );

            if (result.success) {
                this.notifier.showInfo(result.message);
            } else {
                this.notifier.showError(result.message);
            }

            this.post(
                new StartInstanceResultQuery(
                    result.success,
                    result.message,
                    result.processInstanceId,
                ),
            );
        } catch (error) {
            const message = "An unexpected error occurred while starting the process instance.";
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.notifier.showError(message);
            this.post(new StartInstanceResultQuery(false, message));
        }
    }

    /**
     * Validates the incoming payload, runs the deployment, shows a notification,
     * and sends the result back to the webview.
     *
     * @param configPayload Raw deployment config from the webview form.
     */
    private async handleDeploy(configPayload: DeployCommand["config"]): Promise<void> {
        try {
            const auth = this.buildAuth(configPayload.auth);

            // Trust only the active editor's document for the file being deployed,
            // never the webview payload's mainFilePath.
            const activeEditorId = this.editorStore.getActiveEditorId();
            const mainFilePath = this.documentPort.getFilePath(activeEditorId);

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
                this.notifier.showInfo(result.message);
            } else {
                this.notifier.showError(result.message);
            }

            this.post(
                new DeploymentResultQuery(result.success, result.message, result.deploymentId),
            );
        } catch (error) {
            const message =
                error instanceof InvalidDeploymentConfigError
                    ? error.message
                    : "An unexpected error occurred during deployment.";

            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.notifier.showError(message);
            this.post(new DeploymentResultQuery(false, message));
        }
    }

    /** Maps the webview's auth payload to the domain auth value object. */
    private buildAuth(
        authPayload: DeployCommand["config"]["auth"],
    ): NoAuth | BasicAuth | OAuth2Auth {
        if (authPayload.authType === "basic") {
            return new BasicAuth(authPayload.username ?? "", authPayload.password ?? "");
        }
        if (authPayload.authType === "oauth2") {
            return new OAuth2Auth(
                authPayload.clientId ?? "",
                authPayload.clientSecret ?? "",
                authPayload.tokenEndpoint ?? "",
                authPayload.audience ?? "",
            );
        }
        return new NoAuth();
    }
}
