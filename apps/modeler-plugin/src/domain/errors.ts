/** Thrown when no VS Code workspace folder is found for a given document. */
export class NoWorkspaceFolderFoundError extends Error {
    constructor() {
        super("No workspace folder found.");
    }
}

/** Thrown when a file cannot be found at the given path. */
export class FileNotFound extends Error {
    constructor(path: string) {
        super(`File not found: ${path}`);
    }
}

/** Thrown when a directory cannot be found at the given path. */
export class DirectoryNotFound extends Error {
    constructor(path: string) {
        super(`Directory not found: ${path}`);
    }
}

/** Thrown when the user cancels a prompt (e.g. quick-pick). */
export class UserCancelledError extends Error {
    constructor() {
        super("The operation was cancelled by the user.");
    }
}

/** Thrown when {@link DeploymentConfigBuilder.build} finds empty required fields. */
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

/** Thrown when fetching an OAuth2 access token fails. */
export class TokenFetchError extends Error {
    /**
     * @param reason Human-readable description of why the token fetch failed.
     */
    constructor(reason: string) {
        super(`Failed to fetch OAuth2 access token: ${reason}`);
        this.name = "TokenFetchError";
    }
}

/** Thrown by {@link CamundaRestClient} when the REST API returns a non-2xx status. */
export class DeploymentFailedError extends Error {
    /**
     * @param status HTTP status code returned by the server.
     * @param body Response body text for diagnostic purposes.
     */
    constructor(status: number, body: string) {
        super(`Deployment failed with HTTP ${status}: ${body}`);
        this.name = "DeploymentFailedError";
    }
}

/** Thrown by {@link CamundaRestClient} when starting a process instance returns a non-2xx status. */
export class StartInstanceFailedError extends Error {
    /**
     * @param status HTTP status code returned by the server.
     * @param body Response body text for diagnostic purposes.
     */
    constructor(status: number, body: string) {
        super(`Start instance failed with HTTP ${status}: ${body}`);
        this.name = "StartInstanceFailedError";
    }
}
