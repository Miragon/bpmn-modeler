import * as path from "path";
import { Uri, window, workspace } from "vscode";

import { AuthConfigPayload, DeploymentFormDefaults } from "@miragon/bpmn-modeler-shared";

import { DeploymentConfig, DeploymentResult } from "../domain/deployment";
import { CamundaEnginePort } from "../domain/ports";
import { VsCodeDeploymentState } from "../infrastructure/VsCodeDeploymentState";
import { VsCodeDocument } from "../infrastructure/VsCodeDocument";
import { VsCodeSecretStore } from "../infrastructure/VsCodeSecretStore";
import { VsCodeWorkspace } from "../infrastructure/VsCodeWorkspace";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { detectExecutionPlatform } from "./bpmnUtils";

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
     * @param vsUI User-facing message and logging helper.
     * @param secretStore Secure credential storage for Basic Auth.
     */
    constructor(
        private readonly vsDocument: VsCodeDocument,
        private readonly vsWorkspace: VsCodeWorkspace,
        private readonly deploymentState: VsCodeDeploymentState,
        private readonly restClient: CamundaEnginePort,
        private readonly vsUI: VsCodeUI,
        private readonly secretStore: VsCodeSecretStore,
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
        let engine: "c7" | "c8" = "c7";

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
            endpoint:
                this.deploymentState.getEndpoint() ||
                "http://localhost:8080/engine-rest",
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
     * Opens a VS Code QuickPick (multi-select) showing workspace files that
     * are relevant for deployment (`.form`, `.json`, `.dmn`).
     *
     * Uses `workspace.findFiles` from the VS Code API directly to search across
     * all workspace folders without requiring a dedicated method on
     * {@link VsCodeWorkspace}.
     *
     * @returns Absolute paths of the selected files, or an empty array if the
     *   user cancels or no files match.
     */
    async selectAdditionalFiles(): Promise<string[]> {
        const uris: Uri[] = await workspace.findFiles(
            "**/*.{form,json,dmn}",
            "**/element-templates/**",
            20,
        );

        const items = uris.map((uri) => ({
            label: path.basename(uri.fsPath),
            description: uri.fsPath,
            filePath: uri.fsPath,
        }));

        const selected = await window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: "Select additional files to include in the deployment",
            matchOnDescription: true,
        });

        if (!selected) {
            return [];
        }

        return selected.map((item) => item.filePath);
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
     * @returns The outcome of the deployment attempt.
     */
    async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
        try {
            const fileContents = await this.readFileContents(config);
            const result = await this.restClient.deploy(config, fileContents);

            if (result.success) {
                await this.deploymentState.save(config.endpoint, config.tenantId);
                await this.deploymentState.saveAuthType(config.auth.type);

                if (config.auth.type === "basic") {
                    await this.secretStore.saveBasicAuth(
                        config.auth.username,
                        config.auth.password,
                    );
                } else if (config.auth.type === "oauth2") {
                    await this.secretStore.saveOAuth2(
                        config.auth.clientId,
                        config.auth.clientSecret,
                    );
                    await this.deploymentState.saveOAuth2Config(
                        config.auth.tokenEndpoint,
                        config.auth.audience,
                    );
                }
            }

            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.vsUI.logError(error instanceof Error ? error : new Error(message));
            return new DeploymentResult(false, message);
        }
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    /**
     * Detects the execution platform (`"c7"` or `"c8"`) from the content of
     * the active BPMN document by delegating to {@link detectExecutionPlatform}.
     *
     * @param editorId Document URI path of the target editor.
     * @returns `"c7"` or `"c8"`.
     * @throws If the editor is not found or detection fails.
     */
    private detectEngine(editorId: string): "c7" | "c8" {
        const content = this.vsDocument.getContent(editorId);
        return detectExecutionPlatform(content);
    }

    /**
     * Reads the UTF-8 content of all files referenced in `config` and returns
     * a map of `basename → content` suitable for the multipart POST body.
     *
     * @param config Validated deployment configuration.
     * @returns Map of filename (basename) to UTF-8 string content.
     * @throws {FileNotFound} If any referenced file cannot be read.
     */
    private async readFileContents(
        config: DeploymentConfig,
    ): Promise<Map<string, string>> {
        const contents = new Map<string, string>();

        // Read the main BPMN file.
        const mainContent = await this.vsWorkspace.readFile(config.mainFilePath);
        contents.set(path.basename(config.mainFilePath), mainContent);

        // Read all additional files.
        for (const filePath of config.additionalFilePaths) {
            const content = await this.vsWorkspace.readFile(filePath);
            contents.set(path.basename(filePath), content);
        }

        return contents;
    }
}
