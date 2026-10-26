/**
 * Domain-level abstractions for HTTP transport, Camunda engine interaction and
 * the host facilities only deployment uses (secrets, form state, its prompts
 * and its status-bar item).
 *
 * Decouples business logic from transport and protocol details so that
 * services can be tested with simple in-memory stubs.
 */

import { AuthConfig, DeploymentConfig, DeploymentResult } from "./deployment";
import { DeployedRevision, DeploymentFreshness } from "./deploymentLedger";
import { TargetAuthType } from "./deploymentTarget";
import { EngineDeploymentSnapshot } from "./deploymentVerification";
import { StartInstanceConfig, StartInstanceResult } from "./startInstance";

/**
 * Immutable representation of an HTTP response.
 */
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
 * Minimal HTTP client contract used by infrastructure adapters.
 *
 * Each method maps to a different content-type strategy; implementations
 * handle serialisation, transport, and response buffering.
 */
export interface HttpClient {
    getText(url: string, headers?: Record<string, string>): Promise<HttpResponse>;

    /**
     * Body is returned as raw text so the caller owns parsing — the marketplace
     * adapters need to read GitHub error bodies on non-2xx too.
     */
    getJson(url: string, headers?: Record<string, string>): Promise<HttpResponse>;

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
    postForm(url: string, body: string, headers?: Record<string, string>): Promise<HttpResponse>;

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

/** Deployment's own quick picks, beside the cross-cutting `PickerPort`. */
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

/** The active-target status-bar item, beside the cross-cutting `StatusBarPort`. */
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
 * Persists non-secret deployment-form state (endpoint, tenant, auth type, …)
 * across sessions so the form can be pre-filled on next use.
 */
export interface DeploymentStatePort {
    getEndpoint(): string;
    getTenantId(): string;
    getAuthType(): TargetAuthType;
    saveAuthType(authType: TargetAuthType): Promise<void>;
    getTokenEndpoint(): string;
    getAudience(): string;
    saveOAuth2Config(tokenEndpoint: string, audience: string): Promise<void>;
    save(endpoint: string, tenantId: string): Promise<void>;
    /**
     * The persisted active deployment-target name, or `""` for ad-hoc mode.
     * Synchronous so it can ride the initial webview seed.
     */
    getActiveTargetName(): string;
    saveActiveTargetName(name: string): Promise<void>;
    /**
     * The recorded revision last deployed under `ledgerKey`, or `undefined` when
     * this machine has no record. Synchronous so freshness can be
     * resolved during the initial status-bar render.
     */
    getDeployedRevision(ledgerKey: string): DeployedRevision | undefined;
    saveDeployedRevision(ledgerKey: string, revision: DeployedRevision): Promise<void>;
    /** Every recorded ledger key. Synchronous, like the getters. */
    listLedgerKeys(): string[];
    /** Removes the given ledger slots (target delete/rename, engine says "not deployed"). */
    deleteDeployedRevisions(ledgerKeys: string[]): Promise<void>;
}
