/**
 * Domain-level abstractions for HTTP transport and Camunda engine interaction.
 *
 * Decouples business logic from transport and protocol details so that
 * services can be tested with simple in-memory stubs.
 */

import { DeploymentConfig, DeploymentResult } from "./deployment";
import { StartInstanceConfig, StartInstanceResult } from "./startInstance";

/** Immutable representation of an HTTP response. */
export interface HttpResponse {
    readonly status: number;
    readonly body: string;
}

/**
 * Engine-agnostic contract for deploying resources and starting process
 * instances against a Camunda REST API.
 *
 * Implementations encapsulate all engine-specific protocol details (URL
 * paths, multipart field names, response shapes) so that services only
 * depend on this thin domain port.
 */
export interface CamundaEnginePort {
    /**
     * Deploys one or more resource files to the Camunda engine.
     *
     * @param config Validated deployment configuration.
     * @param fileContents Map of filename (basename) → UTF-8 file content.
     * @returns A {@link DeploymentResult} describing the outcome.
     * @throws {DeploymentFailedError} If the server returns a non-2xx status.
     */
    deploy(
        config: DeploymentConfig,
        fileContents: Map<string, string>,
    ): Promise<DeploymentResult>;

    /**
     * Starts a process instance on the Camunda engine.
     *
     * @param config Validated start-instance configuration.
     * @returns A {@link StartInstanceResult} describing the outcome.
     * @throws {StartInstanceFailedError} If the server returns a non-2xx status.
     */
    startInstance(config: StartInstanceConfig): Promise<StartInstanceResult>;
}

/**
 * Minimal HTTP client contract used by infrastructure adapters.
 *
 * Each method maps to a different content-type strategy; implementations
 * handle serialisation, transport, and response buffering.
 */
export interface HttpClient {
    /**
     * Sends a POST request with a JSON body.
     *
     * @param url Full URL to POST to.
     * @param body JSON-serialisable payload.
     * @param headers Optional extra headers to merge into the request.
     * @returns The HTTP status code and raw response body text.
     */
    postJson(
        url: string,
        body: Record<string, unknown>,
        headers?: Record<string, string>,
    ): Promise<HttpResponse>;

    /**
     * Sends a POST request with a URL-encoded form body.
     *
     * @param url Full URL to POST to.
     * @param body URL-encoded form string.
     * @param headers Optional extra headers to merge into the request.
     * @returns The HTTP status code and raw response body text.
     */
    postForm(
        url: string,
        body: string,
        headers?: Record<string, string>,
    ): Promise<HttpResponse>;

    /**
     * Sends a POST request with a multipart/form-data body.
     *
     * @param url Full URL to POST to.
     * @param body Pre-assembled multipart body buffer.
     * @param boundary The multipart boundary string.
     * @param headers Optional extra headers to merge into the request.
     * @returns The HTTP status code and raw response body text.
     */
    postMultipart(
        url: string,
        body: Buffer,
        boundary: string,
        headers?: Record<string, string>,
    ): Promise<HttpResponse>;
}
