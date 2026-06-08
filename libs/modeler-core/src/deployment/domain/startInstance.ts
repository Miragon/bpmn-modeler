import { AuthConfig, NoAuth } from "./deployment";

import { Engine } from "@miragon/bpmn-modeler-shared";
/**
 * Value object representing a validated configuration for starting a process instance.
 *
 * All fields are immutable after construction.
 */
export class StartInstanceConfig {
    /**
     * @param processDefinitionKey The BPMN process ID used as the definition key.
     * @param endpoint Base URL of the Camunda REST API.
     * @param engine Target execution platform: `"c7"` or `"c8"`.
     * @param auth Authentication configuration for the REST API.
     * @param payload Parsed JSON payload to pass as process variables, or `null` for no payload.
     */
    constructor(
        readonly processDefinitionKey: string,
        readonly endpoint: string,
        readonly engine: Engine,
        readonly auth: AuthConfig = new NoAuth(),
        readonly payload: Record<string, unknown> | null = null,
    ) {}
}

/**
 * Value object representing the outcome of a start-instance attempt.
 *
 * Always returned (never thrown) from the service so callers can handle
 * success and failure uniformly.
 */
export class StartInstanceResult {
    /**
     * @param success Whether the process instance was started successfully.
     * @param message Human-readable description of the outcome.
     * @param processInstanceId Server-assigned process instance identifier (only present on success).
     */
    constructor(
        readonly success: boolean,
        readonly message: string,
        readonly processInstanceId?: string,
    ) {}
}
