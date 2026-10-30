import {
    AdditionalFilesQuery,
    Command,
    CreateTargetCommand,
    DeployCommand,
    DeploymentResultQuery,
    DeploymentTargetsQuery,
    exhaustiveMessageGuard,
    FormDefaultsQuery,
    MessageOfType,
    ProcessDefinitionKeyQuery,
    Query,
    SaveTargetCommand,
    SelectedPayloadFileQuery,
    StartInstanceCommand,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
    TargetSavedQuery,
} from "@miragon/bpmn-modeler-shared";

import { posix } from "path";

import { DeploymentConfigBuilder } from "../domain/deployment";
import {
    AdHocDestination,
    DeploymentDestination,
    namesTarget,
    requestDestination,
    TargetEdit,
} from "../domain/deploymentDestination";
import { TargetRequest } from "../domain/deploymentTarget";
import { DeploymentTargetChangedError, InvalidDeploymentConfigError } from "../domain/errors";
import { DocumentPort, NotifierPort } from "../../kernel/domain/hostPorts";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { routeWebviewLogCommand } from "../../editorSession/service/webviewLog";
import { DeploymentService } from "./DeploymentService";
import { DeploymentTargetService, toAuthConfig, toTargetPayload } from "./DeploymentTargetService";
import { SaveBeforeDeploy } from "./SaveBeforeDeploy";
import { StartInstanceService } from "./StartInstanceService";

type DeploymentWebviewCommand = MessageOfType<
    | "RequestFormDefaultsCommand"
    | "RequestStoredCredentialsCommand"
    | "SelectTargetCommand"
    | "CreateTargetCommand"
    | "SaveTargetCommand"
    | "DeleteTargetCommand"
    | "OpenTargetsFileCommand"
    | "RequestAdditionalFilesCommand"
    | "DeployCommand"
    | "RequestProcessDefinitionKeyCommand"
    | "RequestPayloadFilesCommand"
    | "StartInstanceCommand"
>;

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
    private targetsGeneration = 0;
    private runningTargetCommands = 0;
    private targetsPushDue = false;
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
        private readonly deploymentTargetService: DeploymentTargetService,
        private readonly saveBeforeDeploy: SaveBeforeDeploy,
        private readonly notifier: NotifierPort,
        private readonly post: (message: Query) => void,
    ) {}

    /**
     * Routes one inbound webview {@link Command} to its handler. Unknown types are
     * ignored — the protocol is closed and a stray discriminant is not an error.
     */
    async handle(message: Command): Promise<void> {
        // The deployment webview forwards its own diagnostics as Log*Commands.
        // This dispatcher owns a raw switch (it bypasses WebviewMessageRouter),
        // so route them here or the switch below drops them as unknown types.
        if (routeWebviewLogCommand(this.notifier, message, "deployment")) {
            return;
        }
        this.notifier.logDebug(`Deployment message received -> ${message.type}`);
        const command = message as DeploymentWebviewCommand;
        switch (command.type) {
            case "RequestFormDefaultsCommand":
                this.sendFormDefaults();
                break;
            case "RequestStoredCredentialsCommand":
                await this.handleStoredCredentialsRequest(
                    command.targetName ?? "",
                    command.requestId ?? 0,
                );
                break;
            case "SelectTargetCommand":
                await this.handleSelectTarget(command.name);
                break;
            case "CreateTargetCommand":
                await this.handleCreateTarget(command);
                break;
            case "SaveTargetCommand":
                await this.handleSaveTarget(command);
                break;
            case "DeleteTargetCommand":
                await this.handleDeleteTarget(command.name);
                break;
            case "OpenTargetsFileCommand":
                await this.handleOpenTargetsFile();
                break;
            case "RequestAdditionalFilesCommand":
                await this.handleAdditionalFilesRequest();
                break;
            case "DeployCommand":
                await this.handleDeploy(command.config);
                break;
            case "RequestProcessDefinitionKeyCommand":
                this.handleProcessDefinitionKeyRequest();
                break;
            case "RequestPayloadFilesCommand":
                await this.handlePayloadFilesRequest();
                break;
            case "StartInstanceCommand":
                await this.handleStartInstance(command.config);
                break;
            default:
                exhaustiveMessageGuard(command);
        }
    }

    /**
     * Re-pushes the form defaults + process-definition key for the active editor.
     * Called on panel-visible and active-editor-change so the form always reflects
     * the diagram a deploy acts on.
     */
    sendFormDefaults(): void {
        this.postFormDefaults();

        // The targets select follows the active diagram's workspace, so refresh
        // it alongside the form defaults. Fire-and-forget: a targets-file read
        // must not block the (synchronous) form seed.
        void this.sendTargets();
    }

    private postFormDefaults(): void {
        try {
            const activeEditorId = this.editorStore.getActiveEditorId();
            const defaults = this.deploymentService.getFormDefaults(activeEditorId);
            this.post(new FormDefaultsQuery(defaults));

            // Also send the process definition key for the Start Instance tab.
            try {
                const key = this.startInstanceService.getProcessDefinitionKey(activeEditorId);
                this.post(new ProcessDefinitionKeyQuery(key));
            } catch (error) {
                // A parseable diagram with an unreadable/absent process key is a
                // real degradation of the Start Instance tab — warn, then fall
                // back to an empty key so the form still renders.
                this.notifier.logWarning(
                    `Process-definition key extraction failed: ${(error as Error).message}`,
                );
                this.post(new ProcessDefinitionKeyQuery(""));
            }
        } catch (error) {
            // No active editor is the expected steady state when no editor is
            // open — a debug breadcrumb, not a warning.
            this.notifier.logDebug(
                `No active editor for deployment form defaults: ${(error as Error).message}`,
            );
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
     * Mirrors a target change into the form. A change this panel's own target
     * command made is pushed after that command's reply, because the form ends
     * its reload lock on the first list after a successful `TargetSavedQuery`.
     */
    async targetsChanged(): Promise<void> {
        if (this.runningTargetCommands > 0) {
            this.targetsPushDue = true;
            return;
        }
        await this.sendTargets();
    }

    private async runTargetCommand(command: () => Promise<void>): Promise<void> {
        this.runningTargetCommands++;
        try {
            await command();
        } finally {
            this.runningTargetCommands--;
        }
        if (this.runningTargetCommands === 0 && this.targetsPushDue) {
            this.targetsPushDue = false;
            await this.sendTargets();
        }
    }

    /**
     * Posts the saved targets and the active target name so the sidebar select
     * can render. Called after {@link sendFormDefaults} and after any target
     * change so the form's select always mirrors the persisted state.
     */
    private async sendTargets(): Promise<void> {
        const generation = ++this.targetsGeneration;
        const documentDir = this.activeDocumentDir();
        try {
            const targets = await this.deploymentTargetService.listTargets(documentDir);
            const active = await this.deploymentTargetService.getActiveTarget(documentDir);
            if (generation !== this.targetsGeneration) return;
            this.post(
                new DeploymentTargetsQuery(
                    targets.map(toTargetPayload),
                    active?.name ?? "",
                    documentDir,
                ),
            );
        } catch (error) {
            if (generation !== this.targetsGeneration) return;
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.post(new DeploymentTargetsQuery([], "", documentDir));
        }
    }

    /**
     * Retrieves stored credentials from the secret store and sends them to the
     * webview so it can pre-fill the auth fields. A `targetName` scopes the
     * lookup to a saved target; otherwise the ad-hoc legacy credentials are used.
     */
    private async handleStoredCredentialsRequest(
        targetName: string,
        requestId: number,
    ): Promise<void> {
        try {
            const auth = namesTarget(targetName)
                ? await this.deploymentTargetService.getStoredCredentials(
                      targetName,
                      this.activeDocumentDir(),
                  )
                : await this.deploymentService.getStoredCredentials();
            this.post(new StoredCredentialsQuery(auth, targetName, requestId));
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.post(new StoredCredentialsQuery({ authType: "none" }, targetName, requestId));
        }
    }

    private async handleSelectTarget(name: string): Promise<void> {
        await this.runTargetCommand(async () => {
            try {
                await this.deploymentTargetService.setActiveTarget(name);
                this.postFormDefaults();
            } catch (error) {
                this.notifier.notifyError(
                    "Could not switch deployment target",
                    error instanceof Error ? error : new Error(String(error)),
                );
                await this.sendTargets();
            }
        });
    }

    private async handleCreateTarget(message: CreateTargetCommand): Promise<void> {
        await this.replyToTargetEdit(`Created deployment target "${message.target.name}".`, () =>
            this.deploymentTargetService.createTarget(
                message.target,
                message.auth,
                this.activeDocumentDir(),
            ),
        );
    }

    private async handleSaveTarget(message: SaveTargetCommand): Promise<void> {
        await this.replyToTargetEdit(`Saved deployment target "${message.target.name}".`, () =>
            this.deploymentTargetService.saveTarget(
                message.target,
                message.auth,
                message.previousName,
                this.activeDocumentDir(),
            ),
        );
    }

    private async handleDeleteTarget(name: string): Promise<void> {
        await this.replyToTargetEdit(`Deleted deployment target "${name}".`, () =>
            this.deploymentTargetService.deleteTarget(name, this.activeDocumentDir()),
        );
    }

    /** A cancelled edit (`undefined`) gets no reply. */
    private async replyToTargetEdit(
        successMessage: string,
        edit: () => Promise<TargetEdit | undefined>,
    ): Promise<void> {
        await this.runTargetCommand(async () => {
            try {
                if ((await edit()) !== undefined) {
                    this.post(new TargetSavedQuery(true, successMessage));
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.notifier.logError(error instanceof Error ? error : new Error(errorMessage));
                this.post(new TargetSavedQuery(false, errorMessage));
            }
        });
    }

    private async handleOpenTargetsFile(): Promise<void> {
        try {
            await this.deploymentTargetService.openTargetsFile(this.activeDocumentDir());
        } catch (error) {
            this.notifier.notifyError(
                "Could not open deployment targets file",
                error instanceof Error ? error : new Error(String(error)),
            );
        }
    }

    private async resolveRequestDestination(
        targetName: string | undefined,
        adHoc: AdHocDestination,
        request: TargetRequest,
        documentDir: string | undefined,
    ): Promise<DeploymentDestination> {
        const destination = requestDestination(
            await this.deploymentTargetService.resolveDestination(targetName, adHoc, documentDir),
        );
        destination.assertAdmits(request);
        return destination;
    }

    /** Directory of the active editor's document, or `undefined` if no editor is open. */
    private activeDocumentDir(): string | undefined {
        try {
            const activeEditorId = this.editorStore.getActiveEditorId();
            return posix.dirname(this.documentPort.getFilePath(activeEditorId));
        } catch {
            return undefined;
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
            const documentDir = this.activeDocumentDir();
            const auth = toAuthConfig(configPayload.auth);
            const destination = await this.resolveRequestDestination(
                configPayload.targetName,
                new AdHocDestination(configPayload.endpoint, ""),
                {
                    kind: "startInstance",
                    endpoint: configPayload.endpoint,
                    engine: configPayload.engine,
                    auth,
                    startInstanceUrl: configPayload.startInstanceUrl,
                },
                documentDir,
            );

            const result = await this.startInstanceService.startInstance(
                configPayload.processDefinitionKey,
                configPayload.endpoint,
                configPayload.engine,
                auth,
                configPayload.payloadFilePath,
                configPayload.startInstanceUrl,
                documentDir,
                destination,
            );

            if (result.success) {
                this.notifier.logInfo(`Instance start succeeded: ${result.message}`);
                this.notifier.showInfo(result.message);
            } else {
                this.notifier.logWarning(`Instance start failed: ${result.message}`);
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
            const message =
                error instanceof DeploymentTargetChangedError
                    ? error.message
                    : "An unexpected error occurred while starting the process instance.";
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.notifier.showError(message);
            this.post(new StartInstanceResultQuery(false, message));
        }
    }

    /**
     * Saves only once the config is valid and the target admitted, so a request
     * rejected for either leaves the file on disk untouched.
     *
     * @param configPayload Raw deployment config from the webview form.
     */
    private async handleDeploy(configPayload: DeployCommand["config"]): Promise<void> {
        try {
            const auth = toAuthConfig(configPayload.auth);

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
                .withDeployUrl(configPayload.deployUrl)
                .build();

            const documentDir = posix.dirname(mainFilePath);
            const destination = await this.resolveRequestDestination(
                configPayload.targetName,
                new AdHocDestination(config.endpoint, config.tenantId),
                {
                    kind: "deploy",
                    endpoint: configPayload.endpoint,
                    engine: configPayload.engine,
                    auth,
                    tenantId: configPayload.tenantId,
                    deployUrl: configPayload.deployUrl,
                },
                documentDir,
            );

            const saveResult = await this.saveBeforeDeploy.save(activeEditorId);
            if (!saveResult.saved) {
                this.notifier.showError(saveResult.message);
                this.post(new DeploymentResultQuery(false, saveResult.message));
                return;
            }

            const result = await this.deploymentService.deploy(config, destination);

            if (result.success) {
                this.notifier.logInfo(`Deployment succeeded: ${result.message}`);
                this.notifier.showInfo(result.message);
            } else {
                this.notifier.logWarning(`Deployment failed: ${result.message}`);
                this.notifier.showError(result.message);
            }

            this.post(
                new DeploymentResultQuery(result.success, result.message, result.deploymentId),
            );
        } catch (error) {
            const message =
                error instanceof InvalidDeploymentConfigError ||
                error instanceof DeploymentTargetChangedError
                    ? error.message
                    : "An unexpected error occurred during deployment.";

            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.notifier.showError(message);
            this.post(new DeploymentResultQuery(false, message));
        }
    }
}
