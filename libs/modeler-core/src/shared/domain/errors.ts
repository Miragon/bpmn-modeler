/**
 * Thrown when no VS Code workspace folder is found for a given document.
 */
export class NoWorkspaceFolderFoundError extends Error {
    constructor() {
        super("No workspace folder found.");
    }
}

/**
 * Thrown when a file cannot be found at the given path.
 */
export class FileNotFound extends Error {
    constructor(path: string) {
        super(`File not found: ${path}`);
    }
}

/**
 * Thrown when a directory cannot be found at the given path.
 */
export class DirectoryNotFound extends Error {
    constructor(path: string) {
        super(`Directory not found: ${path}`);
    }
}

/**
 * True for the "The active editor is hidden." error a host handle throws when
 * `postMessage` targets a webview whose tab is not visible. String-matched
 * rather than typed: the throwing handle lives host-side (outside core), so a
 * shared error class can't be enforced — this predicate is the single spelling
 * every caller shares instead.
 */
export function isHiddenEditorError(error: unknown): boolean {
    return error instanceof Error && error.message === "The active editor is hidden.";
}

/**
 * Thrown when the execution platform cannot be auto-detected from BPMN XML.
 */
export class ExecutionPlatformNotDetectedError extends Error {
    constructor() {
        super("The execution platform could not be detected.");
    }
}

/**
 * Thrown when the user cancels a prompt (e.g. quick-pick).
 */
export class UserCancelledError extends Error {
    constructor() {
        super("The operation was cancelled by the user.");
    }
}

export class DeploymentTargetChangedError extends Error {}

/**
 * Thrown when {@link DeploymentConfigBuilder.build} finds empty required fields.
 */
export class InvalidDeploymentConfigError extends Error {
    /**
     * @param missingFields Names of the required fields that were empty.
     */
    constructor(missingFields: string[]) {
        super(
            `Invalid deployment configuration. Missing required fields: ${missingFields.join(", ")}.`,
        );
        this.name = "InvalidDeploymentConfigError";
    }
}

/**
 * Thrown when a `deployment-targets.json` file is malformed or names an
 * unsupported capability. Surfaced via `notifyError`; the file is then treated
 * as if it held no targets rather than crashing the sidebar.
 */
export class InvalidDeploymentTargetsFileError extends Error {
    constructor(reason: string) {
        super(`Invalid deployment targets file: ${reason}`);
        this.name = "InvalidDeploymentTargetsFileError";
    }
}

/**
 * Thrown when creating or renaming a target would collide with an existing
 * target's name, which must stay unique.
 */
export class DuplicateDeploymentTargetError extends Error {
    constructor(name: string) {
        super(`A deployment target named "${name}" already exists.`);
        this.name = "DuplicateDeploymentTargetError";
    }
}

/** Common base so callers can surface every `${env:…}` failure as a plain, actionable message. */
export abstract class EnvReferenceError extends Error {}

export class UnresolvedEnvVariableError extends EnvReferenceError {
    /** @param dotEnvPath The file that was searched; absent when no `.env` applies. */
    constructor(
        readonly variable: string,
        readonly field: string,
        dotEnvPath?: string,
    ) {
        const remedy =
            dotEnvPath === undefined
                ? "References only resolve for diagrams inside a workspace folder."
                : `Define it in ${dotEnvPath}.`;
        super(`Environment variable "${variable}" in "${field}" is not set. ${remedy}`);
        this.name = "UnresolvedEnvVariableError";
    }
}

/**
 * Never echoes the offending text: in a credential field it can be part of a
 * literal secret (`p${env:hunter2}rest`), and these messages get logged.
 */
export class DisallowedEnvReferenceError extends EnvReferenceError {
    constructor(
        readonly field: string,
        prefix: string,
    ) {
        super(
            `"${field}" contains an invalid environment reference. Use \${env:${prefix}NAME} — only variables prefixed ${prefix} from the project's .env are resolved, and literal values must not contain "\${env:".`,
        );
        this.name = "DisallowedEnvReferenceError";
    }
}

export class UnreadableDotEnvError extends EnvReferenceError {
    constructor(
        readonly path: string,
        reason: string,
    ) {
        super(`Could not read ${path}: ${reason}`);
        this.name = "UnreadableDotEnvError";
    }
}

/** Common base for credentials withheld because their destination could not be trusted. */
export abstract class CredentialDestinationError extends Error {}

export class InvalidCredentialDestinationError extends CredentialDestinationError {
    constructor() {
        super(
            "Credentials and .env values are only sent to a URL with a host. Check the endpoint, the URL overrides and the token endpoint.",
        );
        this.name = "InvalidCredentialDestinationError";
    }
}

export class CredentialDestinationNotApprovedError extends CredentialDestinationError {
    constructor(readonly targetName: string) {
        super("Nothing was sent: the host is not approved.");
        this.name = "CredentialDestinationNotApprovedError";
    }
}

/**
 * Thrown when fetching an OAuth2 access token fails.
 */
export class TokenFetchError extends Error {
    /**
     * @param reason Human-readable description of why the token fetch failed.
     */
    constructor(reason: string) {
        super(`Failed to fetch OAuth2 access token: ${reason}`);
        this.name = "TokenFetchError";
    }
}

/**
 * Thrown by {@link CamundaRestClient} when the REST API returns a non-2xx status.
 */
export class DeploymentFailedError extends Error {
    /** @param detail The server's redacted explanation, never its raw body. */
    constructor(status: number, detail?: string) {
        super(`Deployment failed with HTTP ${status}${detailSuffix(detail)}`);
        this.name = "DeploymentFailedError";
    }
}

/**
 * Thrown by the C7 inspection client when a deployment lookup returns a
 * non-2xx, non-404 status (404 means "not deployed", not an error).
 */
export class EngineInspectionFailedError extends Error {
    /** @param detail The server's redacted explanation, never its raw body. */
    constructor(
        readonly status: number,
        detail?: string,
    ) {
        super(`Deployment verification failed with HTTP ${status}${detailSuffix(detail)}`);
        this.name = "EngineInspectionFailedError";
    }

    get isAuthFailure(): boolean {
        return this.status === 401 || this.status === 403;
    }
}

/**
 * Thrown by {@link CamundaRestClient} when starting a process instance returns a non-2xx status.
 */
export class StartInstanceFailedError extends Error {
    /** @param detail The server's redacted explanation, never its raw body. */
    constructor(status: number, detail?: string) {
        super(`Start instance failed with HTTP ${status}${detailSuffix(detail)}`);
        this.name = "StartInstanceFailedError";
    }
}

/**
 * A request that never got a response. The URL is deliberately left out of the
 * message: it may embed `.env` values, and fetch's own errors echo it verbatim.
 */
export class HttpTransportError extends Error {
    constructor(
        readonly host: string,
        readonly reason: string,
    ) {
        super(`Request to ${host} failed: ${reason}`);
        this.name = "HttpTransportError";
    }
}

function detailSuffix(detail: string | undefined): string {
    return detail === undefined ? "." : `: ${detail}`;
}
