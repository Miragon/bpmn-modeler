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
