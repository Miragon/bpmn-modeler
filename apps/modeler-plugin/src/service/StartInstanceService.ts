import * as path from "path";
import { posix } from "path";
import { window } from "vscode";

import { StartInstanceConfig, StartInstanceResult } from "../domain/startInstance";
import { AuthConfig } from "../domain/deployment";
import { CamundaEnginePort } from "../domain/ports";
import { VsCodeDocument } from "../infrastructure/VsCodeDocument";
import { VsCodeWorkspace } from "../infrastructure/VsCodeWorkspace";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { ArtifactService } from "./ArtifactService";
import { extractProcessId } from "./bpmnUtils";

import { Engine } from "@miragon/bpmn-modeler-shared";
/**
 * Orchestrates the "Start Process Instance" workflow.
 *
 * Responsibilities:
 *   1. Extract the process definition key from the active BPMN file.
 *   2. Discover payload JSON files and present them via QuickPick.
 *   3. Read the selected payload file and issue the REST start-instance call.
 */
export class StartInstanceService {
    /**
     * @param vsDocument Active-document path and content helper.
     * @param vsWorkspace Filesystem and workspace-folder helper.
     * @param restClient HTTP client for the Camunda REST API.
     * @param vsUI User-facing message and logging helper.
     * @param artifactService Convention-based file discovery service.
     */
    constructor(
        private readonly vsDocument: VsCodeDocument,
        private readonly vsWorkspace: VsCodeWorkspace,
        private readonly restClient: CamundaEnginePort,
        private readonly vsUI: VsCodeUI,
        private readonly artifactService: ArtifactService,
    ) {}

    /**
     * Extracts the process definition key from the BPMN XML of the given editor.
     *
     * @param editorId Document URI path of the target editor.
     * @returns The process ID from the first `<bpmn:process>` element.
     * @throws {Error} If no process element is found or the editor is not available.
     */
    getProcessDefinitionKey(editorId: string): string {
        const content = this.vsDocument.getContent(editorId);
        return extractProcessId(content);
    }

    /**
     * Discovers payload JSON files using the convention-based walk-up pattern
     * and opens a VS Code QuickPick for single selection.
     *
     * @param editorId Document URI path of the target editor.
     * @returns An object with `filePath` and `label`, or `null` if the user cancels
     *   or no payload files are found.
     */
    async selectPayloadFile(editorId: string): Promise<{ filePath: string; label: string } | null> {
        const filePath = this.vsDocument.getFilePath(editorId);
        const documentDir = posix.dirname(filePath);

        const payloadPaths = await this.artifactService.getPayloadPaths(documentDir);

        if (payloadPaths.length === 0) {
            this.vsUI.showInfo("No payload files found in <configFolder>/payloads/.");
            return null;
        }

        const items = payloadPaths.map((p) => ({
            label: path.basename(p),
            description: p,
            filePath: p,
        }));

        const selected = await window.showQuickPick(items, {
            canPickMany: false,
            placeHolder: "Select a payload file",
            matchOnDescription: true,
        });

        if (!selected) {
            return null;
        }

        return { filePath: selected.filePath, label: selected.label };
    }

    /**
     * Executes the complete start-instance workflow:
     *   1. Reads the payload file (if specified).
     *   2. Issues the REST start-instance request.
     *
     * This method never throws; all errors are captured in the returned
     * {@link StartInstanceResult} with `success: false`.
     *
     * @param processDefinitionKey The BPMN process definition key.
     * @param endpoint Base URL of the Camunda REST API.
     * @param engine Target execution platform.
     * @param auth Authentication configuration.
     * @param payloadFilePath Absolute path to a JSON payload file, or empty string for no payload.
     * @returns The outcome of the start-instance attempt.
     */
    async startInstance(
        processDefinitionKey: string,
        endpoint: string,
        engine: Engine,
        auth: AuthConfig,
        payloadFilePath: string,
    ): Promise<StartInstanceResult> {
        try {
            let payload: Record<string, unknown> | null = null;

            if (payloadFilePath) {
                const content = await this.vsWorkspace.readFile(payloadFilePath);
                payload = JSON.parse(content);
            }

            const config = new StartInstanceConfig(
                processDefinitionKey,
                endpoint,
                engine,
                auth,
                payload,
            );

            return await this.restClient.startInstance(config);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.vsUI.logError(error instanceof Error ? error : new Error(message));
            return new StartInstanceResult(false, message);
        }
    }
}
