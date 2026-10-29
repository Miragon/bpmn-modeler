import { describe, expect, it } from "vitest";

import {
    CredentialDestinationError,
    CredentialDestinationNotApprovedError,
    DeploymentFailedError,
    DisallowedEnvReferenceError,
    DuplicateDeploymentTargetError,
    EngineInspectionFailedError,
    EnvReferenceError,
    InvalidCredentialDestinationError,
    InvalidDeploymentConfigError,
    InvalidDeploymentTargetError,
    InvalidDeploymentTargetsFileError,
    StartInstanceFailedError,
    TokenFetchError,
    UnreadableDotEnvError,
    UnresolvedEnvVariableError,
} from "./errors";

describe("deployment errors", () => {
    it.each<[string, string, () => Error]>([
        [
            "InvalidDeploymentConfigError",
            "Invalid deployment configuration. Missing required fields: endpoint, engine.",
            () => new InvalidDeploymentConfigError(["endpoint", "engine"]),
        ],
        [
            "InvalidDeploymentTargetsFileError",
            "Invalid deployment targets file: `targets` must be an array",
            () => new InvalidDeploymentTargetsFileError("`targets` must be an array"),
        ],
        [
            "InvalidDeploymentTargetError",
            '"endpoint" must be a non-empty string',
            () => new InvalidDeploymentTargetError("endpoint", "must be a non-empty string"),
        ],
        [
            "DuplicateDeploymentTargetError",
            'A deployment target named "dev" already exists.',
            () => new DuplicateDeploymentTargetError("dev"),
        ],
        [
            "UnresolvedEnvVariableError",
            'Environment variable "MIRAGON_TOKEN" in "auth.password" is not set. Define it in /ws/.env.',
            () => new UnresolvedEnvVariableError("MIRAGON_TOKEN", "auth.password", "/ws/.env"),
        ],
        [
            "UnresolvedEnvVariableError",
            'Environment variable "MIRAGON_TOKEN" in "endpoint" is not set. References only resolve for diagrams inside a workspace folder.',
            () => new UnresolvedEnvVariableError("MIRAGON_TOKEN", "endpoint"),
        ],
        [
            "DisallowedEnvReferenceError",
            '"tenantId" contains an invalid environment reference. Use ${env:MIRAGON_NAME} — only variables prefixed MIRAGON_ from the project\'s .env are resolved, and literal values must not contain "${env:".',
            () => new DisallowedEnvReferenceError("tenantId", "MIRAGON_"),
        ],
        [
            "UnreadableDotEnvError",
            "Could not read /ws/.env: symbolic links are not followed",
            () => new UnreadableDotEnvError("/ws/.env", "symbolic links are not followed"),
        ],
        [
            "InvalidCredentialDestinationError",
            "Credentials and .env values are only sent to a URL with a host. Check the endpoint, the URL overrides and the token endpoint.",
            () => new InvalidCredentialDestinationError(),
        ],
        [
            "CredentialDestinationNotApprovedError",
            "Nothing was sent: the host is not approved.",
            () => new CredentialDestinationNotApprovedError("dev"),
        ],
        [
            "TokenFetchError",
            "Failed to fetch OAuth2 access token: HTTP 401",
            () => new TokenFetchError("HTTP 401"),
        ],
        [
            "DeploymentFailedError",
            "Deployment failed with HTTP 500.",
            () => new DeploymentFailedError(500),
        ],
        [
            "DeploymentFailedError",
            "Deployment failed with HTTP 400: Resource is invalid",
            () => new DeploymentFailedError(400, "Resource is invalid"),
        ],
        [
            "EngineInspectionFailedError",
            "Deployment verification failed with HTTP 502.",
            () => new EngineInspectionFailedError(502),
        ],
        [
            "EngineInspectionFailedError",
            "Deployment verification failed with HTTP 500: Lookup failed",
            () => new EngineInspectionFailedError(500, "Lookup failed"),
        ],
        [
            "StartInstanceFailedError",
            "Start instance failed with HTTP 404.",
            () => new StartInstanceFailedError(404),
        ],
        [
            "StartInstanceFailedError",
            "Start instance failed with HTTP 500: No process definition",
            () => new StartInstanceFailedError(500, "No process definition"),
        ],
    ])("%s says %s", (name, message, createError) => {
        const error = createError();

        expect(error.name).toBe(name);
        expect(error.message).toBe(message);
    });

    it.each<[string, () => Error, abstract new (...args: never[]) => Error]>([
        [
            "an unresolved variable",
            () => new UnresolvedEnvVariableError("A", "b"),
            EnvReferenceError,
        ],
        [
            "a disallowed reference",
            () => new DisallowedEnvReferenceError("a", "B"),
            EnvReferenceError,
        ],
        ["an unreadable .env", () => new UnreadableDotEnvError("/a", "b"), EnvReferenceError],
        [
            "a destination without a host",
            () => new InvalidCredentialDestinationError(),
            CredentialDestinationError,
        ],
        [
            "an unapproved destination",
            () => new CredentialDestinationNotApprovedError("dev"),
            CredentialDestinationError,
        ],
    ])("lets a caller catch %s by its family", (_case, createError, family) => {
        expect(createError()).toBeInstanceOf(family);
    });

    describe("EngineInspectionFailedError.isAuthFailure", () => {
        it.each([
            [400, false],
            [401, true],
            [403, true],
            [404, false],
            [500, false],
        ])("is %s → %s", (status, isAuthFailure) => {
            expect(new EngineInspectionFailedError(status).isAuthFailure).toBe(isAuthFailure);
        });
    });
});
