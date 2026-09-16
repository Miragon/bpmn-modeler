import * as path from "path";

import { AuthConfigPayload, DeploymentFormDefaults } from "@miragon/bpmn-modeler-shared";
import { Engine } from "@miragon/bpmn-modeler-types";

import {
    AuthConfig,
    DeploymentConfig,
    DeploymentConfigBuilder,
    DeploymentResult,
} from "../domain/deployment";
import { DeploymentTarget } from "../domain/deploymentTarget";
import {
    DeploymentStatePort,
    DocumentPort,
    NotifierPort,
    PickerPort,
    SecretStorePort,
    WorkspacePort,
} from "../../shared/domain/hostPorts";
import { CamundaEnginePort } from "../domain/ports";
import { BpmnDocument } from "../../shared/domain/BpmnDocument";

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
     * @param deploymentState Persists/restores endpoint and tenantId.
     * @param restClient HTTP client for the Camunda REST API.
     * @param notifier User-facing message and logging helper.
     * @param picker Quick-pick helper for selecting deployment resources.
     * @param secretStore Secure credential storage for Basic Auth.
     */
    constructor(
        private readonly vsDocument: DocumentPort,
        private readonly vsWorkspace: WorkspacePort,
        private readonly deploymentState: DeploymentStatePort,
        private readonly restClient: CamundaEnginePort,
        private readonly notifier: NotifierPort,
        private readonly picker: PickerPort,
        private readonly secretStore: SecretStorePort,
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

        return {
            deploymentName,
            tenantId: this.deploymentState.getTenantId(),
            endpoint: this.deploymentState.getEndpoint() || "http://localhost:8080/engine-rest",
            engine,
            authType: this.deploymentState.getAuthType(),
            tokenEndpoint: this.deploymentState.getTokenEndpoint(),
            audience: this.deploymentState.getAudience(),
        };
    }

    /**
     * Retrieves previously stored credentials from secure storage.
     *
     * @returns An {@link AuthConfigPayload} populated with stored credentials,
     *   or a `"none"` payload if no credentials are available.
     */
    async getStoredCredentials(): Promise<AuthConfigPayload> {
        const authType = this.deploymentState.getAuthType();

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
                    tokenEndpoint: this.deploymentState.getTokenEndpoint(),
                    audience: this.deploymentState.getAudience(),
                };
            }
        }

        return { authType: "none" };
    }

    /**
     * Opens a multi-select picker over workspace files relevant for
     * deployment (`.form`, `.json`, `.dmn`), excluding element templates.
     *
     * @returns Absolute paths of the selected files, or an empty array if the
     *   user cancels or no files match.
     */
    async selectAdditionalFiles(): Promise<string[]> {
        return this.picker.pickWorkspaceFiles({
            glob: "**/*.{form,json,dmn}",
            exclude: "**/element-templates/**",
            placeholder: "Select additional files to include in the deployment",
            limit: 20,
        });
    }

    /**
     * Executes the complete deployment workflow:
     *   1. Reads the main BPMN file and any additional files.
     *   2. Issues the REST deployment request.
     *   3. Persists the endpoint and tenant ID on success.
     *
     * This method never throws; all errors are captured in the returned
     * {@link DeploymentResult} with `success: false`.
     *
     * @param config Validated deployment configuration.
     * @param secretSlot When set, the deploy runs against a named target: only
     *   credentials are persisted, under that slot, and the legacy connection
     *   state is left untouched (it lives in the targets file). When absent, the
     *   ad-hoc path persists connection + credentials to the legacy keys.
     * @returns The outcome of the deployment attempt.
     */
    async deploy(config: DeploymentConfig, secretSlot?: string): Promise<DeploymentResult> {
        try {
            const fileContents = await this.readFileContents(config);
            const result = await this.restClient.deploy(config, fileContents);

            if (result.success) {
                await this.persistOnSuccess(config, secretSlot);
            }

            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.notifier.logError(error instanceof Error ? error : new Error(message));
            return new DeploymentResult(false, message);
        }
    }

    /**
     * Deploys each path as its own single-file deployment against `target`,
     * naming the deployment after the file's basename. Never throws — a failed
     * file yields a failed {@link DeploymentResult} so the batch always completes
     * and the caller sees a per-file outcome. Credentials are assumed already
     * stored on the target, so nothing is persisted here.
     */
    async deployFiles(
        paths: string[],
        target: DeploymentTarget,
        auth: AuthConfig,
    ): Promise<DeploymentResult[]> {
        const results: DeploymentResult[] = [];
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
                const fileContents = await this.readFileContents(config);
                const result = await this.restClient.deploy(config, fileContents);
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
        if (succeeded === results.length) {
            this.notifier.showInfo(summary);
        } else {
            this.notifier.showError(summary);
        }
        return results;
    }

    private async persistOnSuccess(config: DeploymentConfig, secretSlot?: string): Promise<void> {
        if (secretSlot !== undefined) {
            await this.saveSecrets(config.auth, secretSlot);
            return;
        }

        await this.deploymentState.save(config.endpoint, config.tenantId);
        await this.deploymentState.saveAuthType(config.auth.type);
        if (config.auth.type === "oauth2") {
            await this.deploymentState.saveOAuth2Config(
                config.auth.tokenEndpoint,
                config.auth.audience,
            );
        }
        await this.saveSecrets(config.auth);
    }

    private async saveSecrets(auth: AuthConfig, slot?: string): Promise<void> {
        if (auth.type === "basic") {
            await this.secretStore.saveBasicAuth(auth.username, auth.password, slot);
        } else if (auth.type === "oauth2") {
            await this.secretStore.saveOAuth2(auth.clientId, auth.clientSecret, slot);
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
