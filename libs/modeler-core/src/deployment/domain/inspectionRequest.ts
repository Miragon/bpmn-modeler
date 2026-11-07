import { CredentialDestinations } from "./credentialDestinations";
import { AuthConfig, NoAuth, requestSecrets, sensitiveDestinations } from "./deployment";
import { containsEnvRef, EnvLookup, expandEnvRefs, recordingLookup } from "./envRef";
import { InvalidDeploymentConfigError } from "./errors";
import { SecretRedactor } from "./secretRedactor";

/**
 * Addresses the latest deployed version of one process on an engine. The
 * lookup needs the plain REST base URL, so a target's URL overrides never
 * reach it.
 */
export class InspectionRequest {
    /**
     * @param processKey The BPMN process id; it comes from the diagram, so it
     *   is never expanded.
     * @param envValues The `.env` values an expanded copy carries; empty for a
     *   literal request.
     */
    constructor(
        readonly endpoint: string,
        readonly tenantId: string,
        readonly processKey: string,
        readonly auth: AuthConfig = new NoAuth(),
        readonly envValues: readonly string[] = [],
    ) {}

    referencesEnv(): boolean {
        return [this.endpoint, this.tenantId].some(containsEnvRef) || this.auth.referencesEnv();
    }

    sensitiveDestinations(): CredentialDestinations {
        return sensitiveDestinations(this.endpoint, this.auth, this.envValues);
    }

    redactor(): SecretRedactor {
        return requestSecrets(this.auth, this.envValues);
    }

    /**
     * Request-only copy; this request stays literal. Rejects an endpoint that
     * is blank after expansion, such as one whose variable is set to "".
     */
    expandEnvRefs(lookup: EnvLookup): InspectionRequest {
        const recording = recordingLookup(lookup);
        const auth = this.auth.expandEnvRefs(recording);
        const endpoint = expandEnvRefs(this.endpoint, recording, "endpoint");
        if (!endpoint.trim()) {
            throw new InvalidDeploymentConfigError(["endpoint"]);
        }
        return new InspectionRequest(
            endpoint,
            expandEnvRefs(this.tenantId, recording, "tenantId"),
            this.processKey,
            auth,
            [...recording.resolved],
        );
    }
}
