export class NoModelerError extends Error {
    constructor() {
        super("Modeler is not initialized!");
    }
}

/**
 * Thrown when a modeler is created for an unknown engine string.
 */
export class UnsupportedEngineError extends Error {
    /**
     * @param engine The unrecognised engine string.
     */
    constructor(engine: string) {
        super(`Unsupported engine: ${engine}`);
    }
}

/**
 * Create a list of information that will be sent to the backend and get logged.
 * @param errors A list of further information. bpmn-js types its import
 *   warnings as `string[]` but reports `{ message, ... }` objects.
 */
export function formatErrors(errors: readonly unknown[]): string {
    let msg = "";
    if (errors && errors.length > 0) {
        for (const entry of errors) {
            msg += `\n- ${describeEntry(entry)}`;
        }
    }
    return msg;
}

function describeEntry(entry: unknown): string {
    if (typeof entry === "object" && entry !== null && "message" in entry) {
        return String(entry.message);
    }
    return String(entry);
}
