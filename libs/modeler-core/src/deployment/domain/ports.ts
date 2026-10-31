/**
 * Domain-level abstractions for Camunda engine interaction and the host
 * facilities only deployment uses (secrets, form state, its prompts and its
 * status-bar item).
 *
 * Decouples business logic from transport and protocol details so that
 * services can be tested with simple in-memory stubs.
 */

import { AuthConfig, DeploymentConfig, DeploymentResult } from "./deployment";
import { DeploymentFreshness } from "./deploymentLedger";
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
 * The feature-shaped deployment prompts. The core builds them in
 * `deploymentPrompts.ts` and asks through `PickerPort`, so this stays only until
 * the hosts drop it with the other feature-shaped prompts.
 */
export interface DeploymentPickerPort {
    /** @returns the chosen payload, or `null` on dismissal. */
    pickPayloadFile(paths: string[]): Promise<{ filePath: string; label: string } | null>;

    /**
     * Prompts for the active deployment target. `names` are the saved targets;
     * the picker also offers an explicit "(none — use form values)" entry for
     * ad-hoc mode.
     *
     * @returns the chosen target name, `""` for the ad-hoc entry, or `undefined`
     *   on dismissal (a no-op, mirroring the engine-version cancel convention).
     */
    pickDeploymentTarget(names: string[]): Promise<string | undefined>;

    /**
     * The status-bar item's click menu: switch the active target, or (for a
     * Camunda 7 target) verify the ledger against the engine.
     *
     * @returns the chosen action, or `undefined` on dismissal (a no-op).
     */
    pickDeploymentStatusAction(opts: {
        targetName?: string;
        canVerify: boolean;
    }): Promise<"switch" | "verify" | undefined>;
}

/**
 * The widget-shaped deployment status methods. The core shows the deployment
 * target slot through `StatusBarPort`, so this stays only until the hosts drop
 * it together with `LegacyStatusBarPort`.
 */
export interface DeploymentStatusBarPort {
    /**
     * `undefined` name renders "No deployment target"; a name renders the active
     * target. `freshness` drives the coloured dot; `deployedAt` / `verifiedAt`
     * (ISO) enrich the tooltip when a revision was recorded / engine-verified.
     */
    showDeploymentTarget(
        name: string | undefined,
        freshness: DeploymentFreshness,
        deployedAt?: string,
        verifiedAt?: string,
    ): void;
    hideDeploymentTarget(): void;
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
    saveBasicAuth(username: string, password: string, slot?: string): Promise<void>;
    getBasicAuth(slot?: string): Promise<{ username: string; password: string } | undefined>;
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
    /** Writes only what `patch` names. */
    save(patch: DeploymentStatePatch): Promise<void>;
}
