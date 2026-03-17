import { InvalidDeploymentConfigError } from "./errors";

// ─── Auth value objects ─────────────────────────────────────────────────────

/**
 * Discriminated union of supported authentication strategies.
 *
 * Designed for extension: add new variants (e.g. `OAuth2Auth`) without
 * modifying existing code.
 */
export type AuthConfig = NoAuth | BasicAuth | OAuth2Auth;

/** No authentication requests are sent without an `Authorization` header. */
export class NoAuth {
    /** Discriminant for the {@link AuthConfig} union. */
    readonly type = "none" as const;
}

/**
 * HTTP Basic authentication.
 *
 * Credentials are sent as `Authorization: Basic base64(username:password)`.
 */
export class BasicAuth {
    /** Discriminant for the {@link AuthConfig} union. */
    readonly type = "basic" as const;

    /**
     * @param username The Basic Auth username.
     * @param password The Basic Auth password.
     */
    constructor(
        readonly username: string,
        readonly password: string,
    ) {}
}

/**
 * OAuth2 Client Credentials authentication.
 *
 * An access token is fetched from `tokenEndpoint` using the client credentials
 * grant and sent as `Authorization: Bearer <token>`.
 */
export class OAuth2Auth {
    /** Discriminant for the {@link AuthConfig} union. */
    readonly type = "oauth2" as const;

    /**
     * @param clientId The OAuth2 client identifier.
     * @param clientSecret The OAuth2 client secret.
     * @param tokenEndpoint URL of the token endpoint that issues access tokens.
     * @param audience The target audience for the token (may be empty).
     */
    constructor(
        readonly clientId: string,
        readonly clientSecret: string,
        readonly tokenEndpoint: string,
        readonly audience: string,
    ) {}
}

// ─── Deployment config ──────────────────────────────────────────────────────

/**
 * Value object representing a validated deployment configuration.
 *
 * All fields are immutable after construction. Use {@link DeploymentConfigBuilder}
 * to construct instances with validation.
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
     */
    constructor(
        readonly deploymentName: string,
        readonly tenantId: string,
        readonly endpoint: string,
        readonly engine: "c7" | "c8",
        readonly mainFilePath: string,
        readonly additionalFilePaths: string[],
        readonly auth: AuthConfig = new NoAuth(),
    ) {}
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

    private _engine: "c7" | "c8" = "c7";

    private _mainFilePath = "";

    private _additionalFilePaths: string[] = [];

    private _auth: AuthConfig = new NoAuth();

    /**
     * Sets the deployment name (required).
     *
     * @param name Human-readable deployment name.
     * @returns `this` for chaining.
     */
    withDeploymentName(name: string): this {
        this._deploymentName = name;
        return this;
    }

    /**
     * Sets the optional tenant ID.
     *
     * @param tenantId Tenant identifier string (may be empty).
     * @returns `this` for chaining.
     */
    withTenantId(tenantId: string): this {
        this._tenantId = tenantId;
        return this;
    }

    /**
     * Sets the REST endpoint URL (required).
     *
     * @param endpoint Base URL of the Camunda REST API.
     * @returns `this` for chaining.
     */
    withEndpoint(endpoint: string): this {
        this._endpoint = endpoint;
        return this;
    }

    /**
     * Sets the target execution platform.
     *
     * @param engine `"c7"` for Camunda Platform 7, `"c8"` for Camunda Cloud 8.
     * @returns `this` for chaining.
     */
    withEngine(engine: "c7" | "c8"): this {
        this._engine = engine;
        return this;
    }

    /**
     * Sets the absolute path to the primary BPMN file (required).
     *
     * @param filePath Absolute filesystem path of the main BPMN file.
     * @returns `this` for chaining.
     */
    withMainFilePath(filePath: string): this {
        this._mainFilePath = filePath;
        return this;
    }

    /**
     * Sets the list of additional file paths to include in the deployment.
     *
     * @param filePaths Array of absolute filesystem paths.
     * @returns `this` for chaining.
     */
    withAdditionalFilePaths(filePaths: string[]): this {
        this._additionalFilePaths = filePaths;
        return this;
    }

    /**
     * Sets the authentication configuration.
     *
     * @param auth Authentication strategy to use. Defaults to {@link NoAuth}.
     * @returns `this` for chaining.
     */
    withAuth(auth: AuthConfig): this {
        this._auth = auth;
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
        );
    }
}

/**
 * Value object representing the outcome of a deployment attempt.
 *
 * Always returned (never thrown) from {@link DeploymentService.deploy} so
 * callers can handle success and failure uniformly.
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
