import { InvalidDeploymentConfigError } from "../../shared/domain/errors";
import { CredentialDestinations } from "./credentialDestinations";
import { AuthConfig, NoAuth, sensitiveDestinations } from "./deployment";
import {
    containsEnvRef,
    EnvLookup,
    expandEnvRefs,
    expandOptionalEnvRefs,
    recordingLookup,
} from "./envRef";
import { SecretRedactor } from "./secretRedactor";
import { expandUrlTemplate } from "./urlTemplate";

import { Engine } from "@miragon/bpmn-modeler-types";
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
     * @param startInstanceUrl Optional full-URL override for the start-instance
     *   call; `{processDefinitionKey}` is substituted before the request.
     * @param envValues The `.env` values an expanded copy carries; empty for a
     *   literal config.
     */
    constructor(
        readonly processDefinitionKey: string,
        readonly endpoint: string,
        readonly engine: Engine,
        readonly auth: AuthConfig = new NoAuth(),
        readonly payload: Record<string, unknown> | null = null,
        readonly startInstanceUrl?: string,
        readonly envValues: readonly string[] = [],
    ) {}

    referencesEnv(): boolean {
        return (
            containsEnvRef(this.endpoint) ||
            containsEnvRef(this.startInstanceUrl) ||
            this.auth.referencesEnv()
        );
    }

    /**
     * The override is expanded first: `{processDefinitionKey}` may sit in its
     * host. A conventional route is appended to `endpoint`, which keeps its origin.
     */
    sensitiveDestinations(): CredentialDestinations {
        const requestUrl = this.startInstanceUrl
            ? expandUrlTemplate(this.startInstanceUrl, {
                  processDefinitionKey: this.processDefinitionKey,
              })
            : this.endpoint;
        return sensitiveDestinations(requestUrl, this.auth, this.envValues);
    }

    carriesEnvValues(): boolean {
        return this.envValues.length > 0;
    }

    /** What a server must not be able to echo back from this request. */
    redactor(): SecretRedactor {
        return this.auth.redactor().and(SecretRedactor.of(...this.envValues));
    }

    /**
     * Request-only copy, expanded before the REST client substitutes
     * `{processDefinitionKey}` into the URL. A variable set to an empty value
     * obeys the same rules as a typed one: a blank override falls back to the
     * convention route, a blank endpoint is rejected.
     */
    expandEnvRefs(lookup: EnvLookup): StartInstanceConfig {
        const recording = recordingLookup(lookup);
        const endpoint = expandEnvRefs(this.endpoint, recording, "endpoint");
        if (!endpoint.trim()) {
            throw new InvalidDeploymentConfigError(["endpoint"]);
        }
        const startInstanceUrl = expandOptionalEnvRefs(
            this.startInstanceUrl,
            recording,
            "endpoints.startInstance",
        )?.trim();
        const auth = this.auth.expandEnvRefs(recording);
        return new StartInstanceConfig(
            this.processDefinitionKey,
            endpoint,
            this.engine,
            auth,
            this.payload,
            startInstanceUrl || undefined,
            [...recording.resolved],
        );
    }
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
