import { InvalidDeploymentConfigError } from "./errors";

import { Engine } from "@miragon/bpmn-modeler-shared";
export type AuthConfig = NoAuth | BasicAuth | OAuth2Auth;

export class NoAuth {
    readonly type = "none" as const;
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
     */
    constructor(
        readonly deploymentName: string,
        readonly tenantId: string,
        readonly endpoint: string,
        readonly engine: Engine,
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

    private _engine: Engine = "c7";

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
    withEngine(engine: Engine): this {
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
