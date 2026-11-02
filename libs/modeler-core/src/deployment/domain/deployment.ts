import { InvalidDeploymentConfigError } from "./errors";
import { CredentialDestinations } from "./credentialDestinations";
import {
    assertEnvRefsValid,
    containsEnvRef,
    EnvLookup,
    expandCredentialEnvRefs,
    expandEnvRefs,
    expandOptionalEnvRefs,
    recordingLookup,
} from "./envRef";
import { SecretRedactor } from "./secretRedactor";

import { Engine } from "@miragon/bpmn-modeler-types";
export type AuthConfig = NoAuth | BasicAuth | OAuth2Auth;

export class NoAuth {
    readonly type = "none" as const;

    /**
     * No credentials to send, so the request needs no auth headers.
     */
    toHeaders(): Record<string, string> {
        return {};
    }

    referencesEnv(): boolean {
        return false;
    }

    assertCredentialEnvRefsValid(): void {
        // No credential fields that could carry a reference.
    }

    expandEnvRefs(_lookup: EnvLookup): NoAuth {
        return this;
    }

    redactor(): SecretRedactor {
        return SecretRedactor.none();
    }

    destinationsFor(_requestUrl: string): CredentialDestinations {
        return CredentialDestinations.none();
    }
}

/**
 * Sent as `Authorization: Basic base64(username:password)`.
 */
export class BasicAuth {
    readonly type = "basic" as const;

    constructor(
        readonly username: string,
        readonly password: string,
    ) {}

    /**
     * RFC 7617 mandates UTF-8 for the userid:password octet sequence before
     * base64 — `btoa()` would Latin-1-encode and silently corrupt non-ASCII
     * credentials, so we go through `Buffer` which encodes UTF-8 by default.
     */
    toHeaders(): Record<string, string> {
        const credentials = Buffer.from(`${this.username}:${this.password}`).toString("base64");
        return { Authorization: `Basic ${credentials}` };
    }

    referencesEnv(): boolean {
        return containsEnvRef(this.username) || containsEnvRef(this.password);
    }

    assertCredentialEnvRefsValid(): void {
        assertEnvRefsValid(this.username, "auth.username");
        assertEnvRefsValid(this.password, "auth.password");
    }

    expandEnvRefs(lookup: EnvLookup): BasicAuth {
        return new BasicAuth(
            expandCredentialEnvRefs(this.username, lookup, "auth.username"),
            expandCredentialEnvRefs(this.password, lookup, "auth.password"),
        );
    }

    redactor(): SecretRedactor {
        return SecretRedactor.of(this.username, this.password);
    }

    destinationsFor(requestUrl: string): CredentialDestinations {
        return CredentialDestinations.of(requestUrl);
    }
}

/**
 * OAuth2 Client Credentials grant: an access token is fetched from
 * `tokenEndpoint` and sent as `Authorization: Bearer <token>`.
 */
export class OAuth2Auth {
    readonly type = "oauth2" as const;

    constructor(
        readonly clientId: string,
        readonly clientSecret: string,
        readonly tokenEndpoint: string,
        readonly audience: string,
    ) {}

    referencesEnv(): boolean {
        return [this.clientId, this.clientSecret, this.tokenEndpoint, this.audience].some(
            containsEnvRef,
        );
    }

    assertCredentialEnvRefsValid(): void {
        assertEnvRefsValid(this.clientId, "auth.clientId");
        assertEnvRefsValid(this.clientSecret, "auth.clientSecret");
    }

    expandEnvRefs(lookup: EnvLookup): OAuth2Auth {
        return new OAuth2Auth(
            expandCredentialEnvRefs(this.clientId, lookup, "auth.clientId"),
            expandCredentialEnvRefs(this.clientSecret, lookup, "auth.clientSecret"),
            expandEnvRefs(this.tokenEndpoint, lookup, "auth.tokenEndpoint"),
            expandEnvRefs(this.audience, lookup, "auth.audience"),
        );
    }

    redactor(): SecretRedactor {
        return SecretRedactor.of(this.clientId, this.clientSecret);
    }

    /** The client secret goes to the token endpoint, the token it returns to the request URL. */
    destinationsFor(requestUrl: string): CredentialDestinations {
        return CredentialDestinations.of(requestUrl, this.tokenEndpoint);
    }
}

/**
 * Where a request sends something secret: its credentials, or `.env` values
 * anywhere in it — a committed targets file chooses where both go.
 */
export function sensitiveDestinations(
    requestUrl: string,
    auth: AuthConfig,
    envValues: readonly string[],
): CredentialDestinations {
    const credentialDestinations = auth.destinationsFor(requestUrl);
    return envValues.length === 0
        ? credentialDestinations
        : credentialDestinations.union(CredentialDestinations.of(requestUrl));
}

/**
 * Use {@link DeploymentConfigBuilder} to construct instances with validation.
 */
export class DeploymentConfig {
    /**
     * @param deploymentName Human-readable name for the deployment (required).
     * @param tenantId Optional tenant identifier (may be empty string).
     * @param endpoint Base URL of the Camunda REST API (required).
     * @param engine Target execution platform: `"c7"` for Camunda Platform 7,
     *   `"c8"` for Camunda Cloud 8.
     * @param mainFilePath Absolute path to the primary BPMN file being deployed.
     * @param additionalFilePaths Absolute paths of supplementary files (forms, DMN, etc.).
     * @param auth Authentication configuration for the REST API.
     * @param deployUrl Optional full-URL override for the deploy call; when set,
     *   the client posts here instead of deriving the URL from `endpoint`.
     * @param envValues The `.env` values an expanded copy carries; empty for a
     *   literal config.
     */
    constructor(
        readonly deploymentName: string,
        readonly tenantId: string,
        readonly endpoint: string,
        readonly engine: Engine,
        readonly mainFilePath: string,
        readonly additionalFilePaths: string[],
        readonly auth: AuthConfig = new NoAuth(),
        readonly deployUrl?: string,
        readonly envValues: readonly string[] = [],
    ) {}

    referencesEnv(): boolean {
        return (
            [this.tenantId, this.endpoint, this.deployUrl].some(containsEnvRef) ||
            this.auth.referencesEnv()
        );
    }

    /** A conventional route is appended to `endpoint`, which keeps its origin. */
    sensitiveDestinations(): CredentialDestinations {
        return sensitiveDestinations(this.deployUrl ?? this.endpoint, this.auth, this.envValues);
    }

    carriesEnvValues(): boolean {
        return this.envValues.length > 0;
    }

    /** What a server must not be able to echo back from this request. */
    redactor(): SecretRedactor {
        return this.auth.redactor().and(SecretRedactor.of(...this.envValues));
    }

    /**
     * Request-only copy: the literal config stays the one that is persisted, so
     * a resolved secret never reaches the secret store. Rebuilt through the
     * builder so a variable set to an empty value obeys the same rules as a
     * typed one.
     */
    expandEnvRefs(lookup: EnvLookup): DeploymentConfig {
        const recording = recordingLookup(lookup);
        const builder = new DeploymentConfigBuilder()
            .withDeploymentName(this.deploymentName)
            .withTenantId(expandEnvRefs(this.tenantId, recording, "tenantId"))
            .withEndpoint(expandEnvRefs(this.endpoint, recording, "endpoint"))
            .withEngine(this.engine)
            .withMainFilePath(this.mainFilePath)
            .withAdditionalFilePaths(this.additionalFilePaths)
            .withAuth(this.auth.expandEnvRefs(recording))
            .withDeployUrl(expandOptionalEnvRefs(this.deployUrl, recording, "endpoints.deploy"));
        return builder.withEnvValues([...recording.resolved]).build();
    }
}

/**
 * Fluent builder for {@link DeploymentConfig}.
 *
 * Collects all required and optional fields, then validates and creates the
 * immutable {@link DeploymentConfig} value object on {@link build}.
 */
export class DeploymentConfigBuilder {
    private _deploymentName = "";

    private _tenantId = "";

    private _endpoint = "";

    private _engine: Engine = "c7";

    private _mainFilePath = "";

    private _additionalFilePaths: string[] = [];

    private _auth: AuthConfig = new NoAuth();

    private _deployUrl: string | undefined = undefined;

    private _envValues: readonly string[] = [];

    withDeploymentName(name: string): this {
        this._deploymentName = name;
        return this;
    }

    withTenantId(tenantId: string): this {
        this._tenantId = tenantId;
        return this;
    }

    withEndpoint(endpoint: string): this {
        this._endpoint = endpoint;
        return this;
    }

    withEngine(engine: Engine): this {
        this._engine = engine;
        return this;
    }

    withMainFilePath(filePath: string): this {
        this._mainFilePath = filePath;
        return this;
    }

    withAdditionalFilePaths(filePaths: string[]): this {
        this._additionalFilePaths = filePaths;
        return this;
    }

    withAuth(auth: AuthConfig): this {
        this._auth = auth;
        return this;
    }

    withDeployUrl(deployUrl: string | undefined): this {
        this._deployUrl = deployUrl?.trim() ? deployUrl.trim() : undefined;
        return this;
    }

    withEnvValues(envValues: readonly string[]): this {
        this._envValues = envValues;
        return this;
    }

    /**
     * Validates and creates the {@link DeploymentConfig}.
     *
     * @returns A new, immutable {@link DeploymentConfig} instance.
     * @throws {InvalidDeploymentConfigError} If `deploymentName`, `endpoint`,
     *   or `mainFilePath` are empty.
     */
    build(): DeploymentConfig {
        const missing: string[] = [];
        if (!this._deploymentName.trim()) {
            missing.push("deploymentName");
        }
        if (!this._endpoint.trim()) {
            missing.push("endpoint");
        }
        if (!this._mainFilePath.trim()) {
            missing.push("mainFilePath");
        }
        if (missing.length > 0) {
            throw new InvalidDeploymentConfigError(missing);
        }
        return new DeploymentConfig(
            this._deploymentName,
            this._tenantId,
            this._endpoint,
            this._engine,
            this._mainFilePath,
            this._additionalFilePaths,
            this._auth,
            this._deployUrl,
            this._envValues,
        );
    }
}

/**
 * Value object representing the outcome of a deployment attempt.
 *
 * Returned, never thrown, from {@link DeploymentService.deploy} so callers can
 * handle success and failure uniformly. A cancelled prompt yields no result.
 */
export class DeploymentResult {
    /**
     * @param success Whether the deployment succeeded.
     * @param message Human-readable description of the outcome.
     * @param deploymentId Server-assigned deployment identifier (only present on success).
     */
    constructor(
        readonly success: boolean,
        readonly message: string,
        readonly deploymentId?: string,
    ) {}
}
