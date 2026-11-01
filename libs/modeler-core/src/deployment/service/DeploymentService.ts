import * as path from "path";

import { AuthConfigPayload, DeploymentFormDefaults } from "@miragon/bpmn-modeler-shared";
import { Engine } from "@miragon/bpmn-modeler-types";

import {
    AuthConfig,
    DeploymentConfig,
    DeploymentConfigBuilder,
    DeploymentResult,
} from "../domain/deployment";
import { DeploymentDestination, NamedDestination } from "../domain/deploymentDestination";
import {
    DeploymentOutcome,
    RememberedPart,
    rememberedPartLabel,
} from "../domain/deploymentOutcome";
import { ADDITIONAL_FILES_GLOB, additionalFilesExclude } from "../domain/additionalFiles";
import { additionalFilesPrompt } from "../domain/deploymentPrompts";
import { connectionPatch } from "../domain/deploymentState";
import { EnvLookup } from "../domain/envRef";
import { loggableHost } from "../../kernel/domain/http";
import {
    DocumentPort,
    NotifierPort,
    PickerPort,
    SettingsPort,
    WorkspacePort,
} from "../../kernel/domain/hostPorts";
import { CamundaEnginePort, DeploymentStatePort, SecretStorePort } from "../domain/ports";
import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import { CredentialApprovalService } from "./CredentialApprovalService";
import { DeploymentStatusService } from "./DeploymentStatusService";
import { EnvValueResolver } from "./EnvValueResolver";
import { storeCredentials } from "./storeCredentials";

/**
 * Orchestrates the full BPMN deployment workflow.
 *
 * Responsibilities:
 *   1. Build pre-populated form defaults for the currently active editor.
 *   2. Open a VS Code QuickPick for selecting additional deployment resources.
 *   3. Read file contents and issue the REST deployment call.
 *   4. Persist endpoint and tenant ID on success.
 *
 * All errors from the REST call or filesystem reads are caught internally and
 * returned as a failed {@link DeploymentResult} so callers never need to
 * handle thrown exceptions from {@link deploy}.
 */
export class DeploymentService {
    /**
     * @param vsDocument Active-document path and content helper.
     * @param vsWorkspace Filesystem and workspace-folder helper.
     * @param deploymentState Persists/restores the ad-hoc connection.
     * @param restClient HTTP client for the Camunda REST API.
     * @param notifier User-facing message and logging helper.
     * @param picker Quick-pick helper for selecting deployment resources.
     * @param secretStore Secure credential storage for Basic Auth.
     * @param settings Names the config folder the additional files leave out.
     */
    constructor(
        private readonly vsDocument: DocumentPort,
        private readonly vsWorkspace: WorkspacePort,
        private readonly deploymentState: DeploymentStatePort,
        private readonly restClient: CamundaEnginePort,
        private readonly notifier: NotifierPort,
        private readonly picker: PickerPort,
        private readonly secretStore: SecretStorePort,
        private readonly deploymentStatus: DeploymentStatusService,
        private readonly envResolver: EnvValueResolver,
        private readonly credentialApproval: CredentialApprovalService,
        private readonly settings: SettingsPort,
    ) {}

    /**
     * Returns pre-populated form defaults for the given editor.
     *
     * The deployment name is derived from the BPMN filename (without extension).
     * The engine is auto-detected from the file content; falls back to `"c7"` if
     * detection fails (e.g. for new/empty files).  The endpoint and tenant ID are
     * restored from the last successful deployment.
     *
     * @param activeEditorId Document URI path of the currently active editor.
     * @returns Defaults to pre-fill in the deployment form.
     */
    getFormDefaults(activeEditorId: string): DeploymentFormDefaults {
        let deploymentName = "";
        let engine: Engine = "c7";

        try {
            const filePath = this.vsDocument.getFilePath(activeEditorId);
            // Derive the deployment name from the filename without extension.
            deploymentName = path.basename(filePath, path.extname(filePath));
            engine = this.detectEngine(activeEditorId);
        } catch {
            // No active editor or detection failed — use empty defaults.
        }

        const state = this.deploymentState.load();
        return {
            deploymentName,
            tenantId: state.tenantId,
            endpoint: state.endpoint || "http://localhost:8080/engine-rest",
            engine,
            authType: state.authType,
            tokenEndpoint: state.tokenEndpoint,
            audience: state.audience,
        };
    }

    /**
     * Retrieves previously stored credentials from secure storage.
     *
     * @returns An {@link AuthConfigPayload} populated with stored credentials,
     *   or a `"none"` payload if no credentials are available.
     */
    async getStoredCredentials(): Promise<AuthConfigPayload> {
        const { authType, tokenEndpoint, audience } = this.deploymentState.load();

        if (authType === "basic") {
            const creds = await this.secretStore.getBasicAuth();
            if (creds) {
                return {
                    authType: "basic",
                    username: creds.username,
                    password: creds.password,
                };
            }
        } else if (authType === "oauth2") {
            const creds = await this.secretStore.getOAuth2();
            if (creds) {
                return {
                    authType: "oauth2",
                    clientId: creds.clientId,
                    clientSecret: creds.clientSecret,
                    tokenEndpoint,
                    audience,
                };
            }
        }

        return { authType: "none" };
    }

    /**
     * Opens a multi-select picker over workspace files relevant for
     * deployment (`.form`, `.json`, `.dmn`), excluding the modeler's own files
     * and the folders no listing offers.
     *
     * @returns Absolute paths of the selected files, or an empty array if the
     *   user cancels or no files match.
     */
    async selectAdditionalFiles(): Promise<string[]> {
        const found = await this.vsWorkspace.findFiles(
            ADDITIONAL_FILES_GLOB,
            additionalFilesExclude(this.settings.getConfigFolder()),
        );
        const chosen = await this.picker.chooseMany(
            additionalFilesPrompt({
                files: found,
                workspaceFolders: this.vsWorkspace.getWorkspaceFolderPaths(),
            }),
        );
        return [...chosen];
    }

    /**
     * Executes the complete deployment workflow:
     *   1. Reads the main BPMN file and any additional files.
     *   2. Issues the REST deployment request with `${env:…}` refs expanded.
     *   3. Once the engine accepts, saves the literal config and records the
     *      ledger row, each on its own: a failed save is logged and named in the
     *      result's message, never turned into a failed deploy.
     *
     * This method never throws; all other errors are captured in the returned
     * {@link DeploymentResult} with `success: false`.
     *
     * @param config Validated deployment configuration.
     * @param destination Decides what an accepted deploy persists: a named
     *   target keeps only its credentials, under its slot, as its connection
     *   lives in the targets file; the ad-hoc connection keeps both under the
     *   legacy keys.
     * @returns The outcome of the deployment attempt.
     */
    async deploy(
        config: DeploymentConfig,
        destination: DeploymentDestination,
    ): Promise<DeploymentResult> {
        try {
            const fileContents = await this.readFileContents(config);
            const documentDir = path.dirname(config.mainFilePath);
            const lookup = await this.envResolver.createLookup(destination, documentDir, config);
            const requestConfig = config.expandEnvRefs(lookup);
            if (destination.requiresApproval(requestConfig)) {
                await this.credentialApproval.ensureApproved(
                    destination,
                    requestConfig.sensitiveDestinations(),
                );
            }

            // Breadcrumb. Only host[:port] of the resolved URL is logged — never the
            // full URL, which can carry credentials, and never the auth payload.
            this.notifier.logInfo(
                `Deployment started: ${path.basename(config.mainFilePath)} -> ${config.engine} @ ${loggableHost(requestConfig.deployUrl ?? requestConfig.endpoint)}`,
            );
            const engineResult = await this.restClient.deploy(requestConfig, fileContents);
            let outcome = DeploymentOutcome.fromEngine(engineResult);
            if (!outcome.succeeded) return outcome.toResult();

            const persistence = destination.credentialPersistence(config.auth);
            if (persistence.legacyConnection !== undefined) {
                const { legacyConnection } = persistence;
                outcome = await this.remember(outcome, "connection", () =>
                    this.deploymentState.save(connectionPatch(legacyConnection, persistence.auth)),
                );
            }
            outcome = await this.remember(outcome, "credentials", () =>
                storeCredentials(this.secretStore, persistence.auth, persistence.secretSlot),
            );
            outcome = await this.remember(outcome, "ledgerRow", () =>
                this.deploymentStatus.recordDeployment(
                    config.mainFilePath,
                    fileContents.get(path.basename(config.mainFilePath)) ?? "",
                    destination.ledgerIdentity(lookup),
                    engineResult.deploymentId,
                ),
            );
            return outcome.toResult();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.notifier.logError(error instanceof Error ? error : new Error(message));
            return new DeploymentResult(false, message);
        }
    }

    /**
     * Deploys each path as its own single-file deployment against the target,
     * naming the deployment after the file's basename. Never throws — a failed
     * file yields a failed {@link DeploymentResult} so the batch always completes
     * and the caller sees a per-file outcome. Credentials are assumed already
     * stored on the target, so nothing is persisted here.
     *
     * @param documentDir The directory `destination` was resolved from. Its `.env`
     *   serves the whole batch, even for files from other workspace folders, so
     *   a target's endpoint and its variables always come from the same project.
     */
    async deployFiles(
        paths: readonly string[],
        destination: NamedDestination,
        auth: AuthConfig,
        documentDir: string | undefined,
    ): Promise<DeploymentResult[]> {
        const { target } = destination;
        const results: DeploymentResult[] = [];
        let pendingLookup: Promise<EnvLookup> | undefined;
        let pendingApproval: Promise<void> | undefined;
        for (const filePath of paths) {
            const name = path.basename(filePath, path.extname(filePath));
            try {
                const config = new DeploymentConfigBuilder()
                    .withDeploymentName(name)
                    .withTenantId(target.tenantId)
                    .withEndpoint(target.endpoint)
                    .withEngine(target.engine)
                    .withMainFilePath(filePath)
                    .withAdditionalFilePaths([])
                    .withAuth(auth)
                    .withDeployUrl(target.deployUrl)
                    .build();
                pendingLookup ??= this.envResolver.createLookup(destination, documentDir, config);
                const envLookup = await pendingLookup;
                const requestConfig = config.expandEnvRefs(envLookup);
                // One answer covers the batch: every file goes to the same target.
                pendingApproval ??= this.credentialApproval.ensureApproved(
                    destination,
                    requestConfig.sensitiveDestinations(),
                );
                await pendingApproval;
                const fileContents = await this.readFileContents(config);
                const engineResult = await this.restClient.deploy(requestConfig, fileContents);
                let outcome = DeploymentOutcome.fromEngine(engineResult);
                if (outcome.succeeded) {
                    outcome = await this.remember(outcome, "ledgerRow", () =>
                        this.deploymentStatus.recordDeployment(
                            filePath,
                            fileContents.get(name + path.extname(filePath)) ?? "",
                            destination.ledgerIdentity(envLookup),
                            engineResult.deploymentId,
                        ),
                    );
                }
                const result = outcome.toResult();
                this.notifier.logInfo(`Deployed ${name}: ${result.message}`);
                results.push(result);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.notifier.logWarning(`Deploy of ${name} failed: ${message}`);
                results.push(new DeploymentResult(false, `${name}: ${message}`));
            }
        }

        const succeeded = results.filter((result) => result.success).length;
        const summary = `Deployed ${succeeded}/${results.length} file(s) to "${target.name}".`;
        const firstFailure = results.find((result) => !result.success);
        if (firstFailure === undefined) {
            this.notifier.showInfo(summary);
        } else {
            this.notifier.showError(`${summary} ${firstFailure.message}`);
        }
        return results;
    }

    private async remember(
        outcome: DeploymentOutcome,
        part: RememberedPart,
        save: () => Promise<void>,
    ): Promise<DeploymentOutcome> {
        try {
            await save();
            return outcome;
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.notifier.logWarning(
                `Deployment succeeded, but saving its ${rememberedPartLabel(part)} failed: ${reason}`,
            );
            return outcome.notRemembering(part, reason);
        }
    }

    /**
     * @throws If the editor is not found or the execution platform cannot
     *   be detected from the document content.
     */
    private detectEngine(editorId: string): Engine {
        return new BpmnDocument(this.vsDocument.getContent(editorId)).detectPlatform();
    }

    /**
     * Reads the UTF-8 content of all files referenced in `config` and returns
     * a map of `basename → content` suitable for the multipart POST body.
     *
     * @param config Validated deployment configuration.
     * @returns Map of filename (basename) to UTF-8 string content.
     * @throws {FileNotFound} If any referenced file cannot be read.
     */
    private async readFileContents(config: DeploymentConfig): Promise<Map<string, string>> {
        const contents = new Map<string, string>();

        // Read the main BPMN file.
        const mainContent = await this.vsWorkspace.readFile(config.mainFilePath);
        contents.set(path.basename(config.mainFilePath), mainContent);

        /**
         * Read all additional files.
         */
        for (const filePath of config.additionalFilePaths) {
            const content = await this.vsWorkspace.readFile(filePath);
            contents.set(path.basename(filePath), content);
        }

        return contents;
    }
}
