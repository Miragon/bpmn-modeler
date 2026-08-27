export class NoModelerError extends Error {
    constructor() {
        super("Modeler is not initialized!");
    }
}

/**
 * Create a list of information that will be sent to the backend and get logged.
 * @param errors A list of further information.
 */
export function formatErrors(errors: string[]): string {
    let msg = "";
    if (errors && errors.length > 0) {
        for (const message of errors) {
            msg += `\n- ${message}`;
        }
    }
    return msg;
}
