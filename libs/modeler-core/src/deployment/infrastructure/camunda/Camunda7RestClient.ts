import { DeploymentConfig, DeploymentResult } from "../../domain/deployment";
import {
    DeploymentFailedError,
    EngineInspectionFailedError,
    StartInstanceFailedError,
} from "../../../shared/domain/errors";
import {
    CamundaEnginePort,
    DefinitionLookup,
    EngineInspectionPort,
    HttpClient,
} from "../../domain/ports";
import { EngineDeploymentSnapshot } from "../../domain/deploymentVerification";
import { StartInstanceConfig, StartInstanceResult } from "../../domain/startInstance";
import { expandUrlTemplate, stripTrailingSlash } from "../../domain/urlTemplate";
import { AuthHeaderResolver } from "./AuthHeaderResolver";
import { MultipartBuilder } from "./MultipartBuilder";

/**
 * Camunda 7 REST API client.
 *
 * Implements {@link CamundaEnginePort} with Camunda Platform 7–specific URL
 * paths, multipart field names, and response shapes, plus the C7-only
 * {@link EngineInspectionPort} deployment lookup.
 */
export class Camunda7RestClient implements CamundaEnginePort, EngineInspectionPort {
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

        const fullUrl =
            config.deployUrl ?? `${stripTrailingSlash(config.endpoint)}/deployment/create`;
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
        const extraHeaders = await this.authResolver.resolve(config.auth);

        const fullUrl = config.startInstanceUrl
            ? expandUrlTemplate(config.startInstanceUrl, {
                  processDefinitionKey: config.processDefinitionKey,
              })
            : `${stripTrailingSlash(config.endpoint)}/process-definition/key/${encodeURIComponent(config.processDefinitionKey)}/start`;
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

    /**
     * Looks up the engine's latest version of a process:
     * `GET /process-definition/key/{key}[/tenant-id/{tenantId}]`, then the
     * deployed XML via `GET /process-definition/{id}/xml`, then (best-effort)
     * the deployment time via `GET /deployment/{deploymentId}`.
     *
     * The `endpoints.deploy` override is deliberately not applied — lookups
     * need the plain REST base URL.
     *
     * @returns the snapshot, or `undefined` when the key is not deployed (404).
     * @throws {EngineInspectionFailedError} on any other non-2xx response.
     */
    async fetchLatestDefinition(
        request: DefinitionLookup,
    ): Promise<EngineDeploymentSnapshot | undefined> {
        const base = stripTrailingSlash(request.endpoint);
        const headers = await this.authResolver.resolve(request.auth);

        const keyPath = request.tenantId.trim()
            ? `key/${encodeURIComponent(request.processKey)}/tenant-id/${encodeURIComponent(request.tenantId.trim())}`
            : `key/${encodeURIComponent(request.processKey)}`;
        const definition = await this.getJsonOrThrow(
            `${base}/process-definition/${keyPath}`,
            headers,
            { undefinedOn404: true },
        );
        if (definition === undefined) {
            return undefined;
        }

        const xmlResponse = await this.getJsonOrThrow(
            `${base}/process-definition/${encodeURIComponent(String(definition.id))}/xml`,
            headers,
        );

        return {
            processDefinitionId: String(definition.id),
            deploymentId: String(definition.deploymentId),
            resourceName: String(definition.resource ?? ""),
            xml: String(xmlResponse?.bpmn20Xml ?? ""),
            deploymentTime: await this.fetchDeploymentTime(
                base,
                String(definition.deploymentId),
                headers,
            ),
        };
    }

    /** Best-effort: a missing deployment time degrades the tooltip, never the verification. */
    private async fetchDeploymentTime(
        base: string,
        deploymentId: string,
        headers: Record<string, string>,
    ): Promise<string | undefined> {
        try {
            const deployment = await this.getJsonOrThrow(
                `${base}/deployment/${encodeURIComponent(deploymentId)}`,
                headers,
            );
            const time = deployment?.deploymentTime;
            return time !== undefined && time !== null ? String(time) : undefined;
        } catch {
            return undefined;
        }
    }

    private async getJsonOrThrow(
        url: string,
        headers: Record<string, string>,
        opts?: { undefinedOn404: boolean },
    ): Promise<Record<string, unknown> | undefined> {
        const { status, body } = await this.httpClient.getJson(url, headers);
        if (status === 404 && opts?.undefinedOn404) {
            return undefined;
        }
        if (status < 200 || status >= 300) {
            throw new EngineInspectionFailedError(status, body);
        }
        try {
            return JSON.parse(body) as Record<string, unknown>;
        } catch {
            throw new EngineInspectionFailedError(status, "Response was not valid JSON");
        }
    }
}
