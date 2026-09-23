import { InvalidDeploymentConfigError } from "../../shared/domain/errors";
import { blankIfWholeEnvRef, EnvLookup, expandEnvRefs, expandOptionalEnvRefs } from "./envRef";

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

    expandEnvRefs(_lookup: EnvLookup): NoAuth {
        return this;
    }

    withoutWholeEnvRefs(): NoAuth {
        return this;
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

    expandEnvRefs(lookup: EnvLookup): BasicAuth {
        return new BasicAuth(
            expandEnvRefs(this.username, lookup, "username"),
            expandEnvRefs(this.password, lookup, "password"),
        );
    }

    /** Whole-value refs live in the shared targets file, so the secret store must not shadow them. */
    withoutWholeEnvRefs(): BasicAuth {
        return new BasicAuth(blankIfWholeEnvRef(this.username), blankIfWholeEnvRef(this.password));
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

    expandEnvRefs(lookup: EnvLookup): OAuth2Auth {
        return new OAuth2Auth(
            expandEnvRefs(this.clientId, lookup, "clientId"),
            expandEnvRefs(this.clientSecret, lookup, "clientSecret"),
            expandEnvRefs(this.tokenEndpoint, lookup, "tokenEndpoint"),
            expandEnvRefs(this.audience, lookup, "audience"),
        );
    }

    /** Whole-value refs live in the shared targets file, so the secret store must not shadow them. */
    withoutWholeEnvRefs(): OAuth2Auth {
        return new OAuth2Auth(
            blankIfWholeEnvRef(this.clientId),
            blankIfWholeEnvRef(this.clientSecret),
            this.tokenEndpoint,
            this.audience,
        );
    }
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
    ) {}

    /**
     * Request-only copy: the literal config stays the one that is persisted, so
     * a resolved secret never reaches the secret store.
     */
    expandEnvRefs(lookup: EnvLookup): DeploymentConfig {
        return new DeploymentConfig(
            this.deploymentName,
            expandEnvRefs(this.tenantId, lookup, "tenantId"),
            expandEnvRefs(this.endpoint, lookup, "endpoint"),
            this.engine,
            this.mainFilePath,
            this.additionalFilePaths,
            this.auth.expandEnvRefs(lookup),
            expandOptionalEnvRefs(this.deployUrl, lookup, "deployUrl"),
        );
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
