import { DeploymentConfig, DeploymentResult } from "../../domain/deployment";
import { DeploymentFailedError, StartInstanceFailedError } from "../../domain/errors";
import { CamundaEnginePort, HttpClient } from "../../domain/ports";
import { StartInstanceConfig, StartInstanceResult } from "../../domain/startInstance";
import { AuthHeaderResolver } from "./AuthHeaderResolver";
import { MultipartBuilder } from "./MultipartBuilder";

/**
 * Camunda 7 REST API client.
 *
 * Implements {@link CamundaEnginePort} with Camunda Platform 7–specific URL
 * paths, multipart field names, and response shapes.
 */
export class Camunda7RestClient implements CamundaEnginePort {
    /**
     * @param httpClient Transport abstraction for HTTP POST requests.
     * @param authResolver Resolves auth configs into concrete HTTP headers.
     */
    constructor(
        private readonly httpClient: HttpClient,
        private readonly authResolver: AuthHeaderResolver,
    ) {}

    /**
     * Deploys resources to Camunda 7 via `POST {endpoint}/deployment/create`.
     *
     * The multipart body includes `deployment-name`, optional `tenant-id`,
     * `deployment-source`, and one file part per resource (part name = filename).
     *
     * @param config Validated deployment configuration.
     * @param fileContents Map of filename (basename) → UTF-8 file content.
     * @returns A {@link DeploymentResult} with the server-assigned deployment ID.
     * @throws {DeploymentFailedError} If the server returns a non-2xx status.
     */
    async deploy(
        config: DeploymentConfig,
        fileContents: Map<string, string>,
    ): Promise<DeploymentResult> {
        const builder = new MultipartBuilder();

        builder.addField("deployment-name", config.deploymentName);
        if (config.tenantId.trim()) {
            builder.addField("tenant-id", config.tenantId);
        }
        builder.addField("deployment-source", "BPMN Modeler");

        for (const [filename, content] of fileContents) {
            builder.addFile(filename, filename, content);
        }

        const { body, boundary } = builder.build();

        const baseEndpoint = config.endpoint.replace(/\/$/, "");
        const fullUrl = `${baseEndpoint}/deployment/create`;
        const extraHeaders = await this.authResolver.resolve(config.auth);

        const { status, body: responseBody } = await this.httpClient.postMultipart(
            fullUrl,
            body,
            boundary,
            extraHeaders,
        );

        if (status < 200 || status >= 300) {
            throw new DeploymentFailedError(status, responseBody);
        }

        let deploymentId: string | undefined;
        try {
            const json = JSON.parse(responseBody);
            deploymentId = json.id !== undefined ? String(json.id) : undefined;
        } catch {
            // Response was not valid JSON — deploymentId remains undefined.
        }

        return new DeploymentResult(
            true,
            `Deployment '${config.deploymentName}' succeeded.`,
            deploymentId,
        );
    }

    /**
     * Starts a process instance on Camunda 7 via
     * `POST {endpoint}/process-definition/key/{key}/start`.
     *
     * @param config Validated start-instance configuration.
     * @returns A {@link StartInstanceResult} with the server-assigned instance ID.
     * @throws {StartInstanceFailedError} If the server returns a non-2xx status.
     */
    async startInstance(config: StartInstanceConfig): Promise<StartInstanceResult> {
        const baseEndpoint = config.endpoint.replace(/\/$/, "");
        const extraHeaders = await this.authResolver.resolve(config.auth);

        const fullUrl = `${baseEndpoint}/process-definition/key/${encodeURIComponent(config.processDefinitionKey)}/start`;
        const requestBody = {
            variables: config.payload ?? {},
        };

        const { status, body: responseBody } = await this.httpClient.postJson(
            fullUrl,
            requestBody,
            extraHeaders,
        );

        if (status < 200 || status >= 300) {
            throw new StartInstanceFailedError(status, responseBody);
        }

        let processInstanceId: string | undefined;
        try {
            const json = JSON.parse(responseBody);
            processInstanceId = json.id !== undefined ? String(json.id) : undefined;
        } catch {
            // Response was not valid JSON — processInstanceId remains undefined.
        }

        return new StartInstanceResult(
            true,
            `Process instance started successfully.`,
            processInstanceId,
        );
    }
}
