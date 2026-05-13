import { DeploymentConfig, DeploymentResult } from "../../domain/deployment";
import { DeploymentFailedError, StartInstanceFailedError } from "../../domain/errors";
import { CamundaEnginePort, HttpClient } from "../../domain/ports";
import { StartInstanceConfig, StartInstanceResult } from "../../domain/startInstance";
import { AuthHeaderResolver } from "./AuthHeaderResolver";
import { MultipartBuilder } from "./MultipartBuilder";

/**
 * Camunda 8 REST API client.
 *
 * Implements {@link CamundaEnginePort} with Camunda 8–specific URL paths,
 * multipart field names, and response shapes.  The API version prefix
 * (e.g. `"v2"`) is configurable via the constructor.
 */
export class Camunda8RestClient implements CamundaEnginePort {
    /**
     * @param httpClient Transport abstraction for HTTP POST requests.
     * @param authResolver Resolves auth configs into concrete HTTP headers.
     * @param apiVersion REST API version prefix for Camunda 8 endpoints (e.g. `"v2"`).
     */
    constructor(
        private readonly httpClient: HttpClient,
        private readonly authResolver: AuthHeaderResolver,
        private readonly apiVersion: string = "v2",
    ) {}

    /**
     * Deploys resources to Camunda 8 via `POST {endpoint}/{apiVersion}/deployments`.
     *
     * The multipart body includes optional `tenantId` and file parts named
     * `"resources"` as required by the Camunda 8 REST API.
     *
     * @param config Validated deployment configuration.
     * @param fileContents Map of filename (basename) → UTF-8 file content.
     * @returns A {@link DeploymentResult} with the server-assigned deployment key.
     * @throws {DeploymentFailedError} If the server returns a non-2xx status.
     */
    async deploy(
        config: DeploymentConfig,
        fileContents: Map<string, string>,
    ): Promise<DeploymentResult> {
        const builder = new MultipartBuilder();

        if (config.tenantId.trim()) {
            builder.addField("tenantId", config.tenantId);
        }

        for (const [filename, content] of fileContents) {
            builder.addFile("resources", filename, content);
        }

        const { body, boundary } = builder.build();

        const baseEndpoint = config.endpoint.replace(/\/$/, "");
        const fullUrl = `${baseEndpoint}/${this.apiVersion}/deployments`;
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
            deploymentId =
                json.deploymentKey !== undefined ? String(json.deploymentKey) : undefined;
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
     * Starts a process instance on Camunda 8 via
     * `POST {endpoint}/{apiVersion}/process-instances`.
     *
     * The JSON body wraps the definition key and variables in the shape
     * expected by the Camunda 8 REST API.
     *
     * @param config Validated start-instance configuration.
     * @returns A {@link StartInstanceResult} with the server-assigned instance key.
     * @throws {StartInstanceFailedError} If the server returns a non-2xx status.
     */
    async startInstance(config: StartInstanceConfig): Promise<StartInstanceResult> {
        const baseEndpoint = config.endpoint.replace(/\/$/, "");
        const extraHeaders = await this.authResolver.resolve(config.auth);

        const fullUrl = `${baseEndpoint}/${this.apiVersion}/process-instances`;
        const requestBody = {
            processDefinitionId: config.processDefinitionKey,
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
            processInstanceId =
                json.processInstanceKey !== undefined ? String(json.processInstanceKey) : undefined;
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
