/**
 * Domain-level abstractions for Camunda engine interaction and the host
 * facilities only deployment uses (secrets and form state).
 *
 * Decouples business logic from transport and protocol details so that
 * services can be tested with simple in-memory stubs.
 */

import { AuthConfig, DeploymentConfig, DeploymentResult } from "./deployment";
import { DeploymentState, DeploymentStatePatch } from "./deploymentState";
import { EngineDeploymentSnapshot } from "./deploymentVerification";
import { StartInstanceConfig, StartInstanceResult } from "./startInstance";

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
    deploy(config: DeploymentConfig, fileContents: Map<string, string>): Promise<DeploymentResult>;

    /**
     * Starts a process instance on the Camunda engine.
     *
     * @param config Validated start-instance configuration.
     * @returns A {@link StartInstanceResult} describing the outcome.
     * @throws {StartInstanceFailedError} If the server returns a non-2xx status.
     */
    startInstance(config: StartInstanceConfig): Promise<StartInstanceResult>;
}

/** Addresses the latest deployed version of one process on an engine. */
export interface DefinitionLookup {
    readonly endpoint: string;
    readonly tenantId: string;
    readonly processKey: string;
    readonly auth: AuthConfig;
    /** The `.env` values the lookup may carry, which an error must never echo. */
    readonly envValues: readonly string[];
}

/**
 * Read-only deployment lookup for on-demand verification. Deliberately separate
 * from {@link CamundaEnginePort}: only Camunda 7 exposes a deployment/resource
 * lookup without Operate, so C8 simply never implements it — no router, no
 * "unsupported" stub.
 */
export interface EngineInspectionPort {
    /**
     * @returns the engine's latest version of the process, or `undefined` when
     *   it is not deployed (404).
     * @throws {EngineInspectionFailedError} on any other non-2xx response.
     */
    fetchLatestDefinition(request: DefinitionLookup): Promise<EngineDeploymentSnapshot | undefined>;
}

/**
 * Encrypted-at-rest storage for sensitive deployment credentials.
 *
 * Every method takes an optional trailing `slot` so credentials can be scoped to
 * a named deployment target. `undefined` addresses the legacy unnamed keys
 * (ad-hoc mode). A slot is `<targetsFilePath>::<name>` so the same target name in
 * two workspaces cannot collide in an application-scoped store like IntelliJ's
 * PasswordSafe.
 */
export interface SecretStorePort {
    /** Replaces both halves of the slot's pair or neither, so a deploy never sends a mixed pair. */
    saveBasicAuth(username: string, password: string, slot?: string): Promise<void>;
    getBasicAuth(slot?: string): Promise<{ username: string; password: string } | undefined>;
    /** Replaces both halves of the slot's pair or neither, like {@link saveBasicAuth}. */
    saveOAuth2(clientId: string, clientSecret: string, slot?: string): Promise<void>;
    getOAuth2(slot?: string): Promise<{ clientId: string; clientSecret: string } | undefined>;
    /**
     * The origins the user approved `slot`'s credentials for; `[]` when none.
     * Kept beside the credentials so they share a lifecycle and a resolved
     * `.env` host is never persisted in cleartext.
     */
    getApprovedDestinations(slot: string): Promise<string[]>;
    saveApprovedDestinations(slot: string, origins: string[]): Promise<void>;
    /** Removes every credential kind and the approved destinations stored under `slot`. */
    delete(slot: string): Promise<void>;
}

/**
 * Persists the non-secret {@link DeploymentState} across sessions. The host
 * stores what a save writes; the core owns the defaults and the shape.
 */
export interface DeploymentStatePort {
    /** Synchronous, so the initial webview seed and status render can read it. */
    load(): DeploymentState;
    /**
     * Writes only what `patch` names, and all of it or none of it, so a rejected
     * save never leaves a connection stored in part. `load()` is guaranteed to
     * show the patch only once this resolves; until then a host may still return
     * the old state.
     */
    save(patch: DeploymentStatePatch): Promise<void>;
}
