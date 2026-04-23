/**
 * Pure helpers for detecting the Camunda execution platform from BPMN XML.
 *
 * Lives in `libs/shared` so both the VS Code extension and the standalone
 * CLI (apps/modeler-cli) can reuse it without pulling in VS Code.
 */

/** Thrown when the execution platform cannot be auto-detected from BPMN XML. */
export class ExecutionPlatformNotDetectedError extends Error {
    constructor() {
        super("The execution platform could not be detected.");
    }
}

/**
 * Detects the Camunda execution platform declared in the BPMN file.
 *
 * First checks for an explicit `modeler:executionPlatformVersion` attribute,
 * then falls back to detecting namespace declarations for `xmlns:camunda`
 * (Camunda 7) and `xmlns:zeebe` (Camunda 8).
 *
 * @param bpmnFile The raw BPMN XML string to inspect.
 * @returns `"c7"` for Camunda Platform 7, `"c8"` for Camunda Cloud 8.
 * @throws {Error} If the execution platform version is unsupported.
 * @throws {ExecutionPlatformNotDetectedError} If the platform cannot be detected.
 */
export function detectExecutionPlatform(bpmnFile: string): "c7" | "c8" {
    const regexExecutionPlatform = /modeler:executionPlatformVersion="([78])\.\d+\.\d+"/;
    const match = bpmnFile.match(regexExecutionPlatform);

    if (match) {
        switch (match[1]) {
            case "7":
                return "c7";
            case "8":
                return "c8";
            default:
                throw new Error(
                    `The execution platform version ${match[1]} is not supported.`,
                );
        }
    }

    if (bpmnFile.match(/xmlns:camunda=".*"/)) {
        return "c7";
    } else if (bpmnFile.match(/xmlns:zeebe=".*"/)) {
        return "c8";
    } else {
        throw new ExecutionPlatformNotDetectedError();
    }
}

/**
 * Extracts the full `modeler:executionPlatformVersion` value from BPMN XML.
 *
 * @param bpmnFile The raw BPMN XML string to inspect.
 * @returns The version string (e.g. `"8.8.0"`) or `undefined` if not found.
 */
export function detectExecutionPlatformVersion(bpmnFile: string): string | undefined {
    const regex = /modeler:executionPlatformVersion="(\d+\.\d+\.\d+)"/;
    const match = bpmnFile.match(regex);
    return match ? match[1] : undefined;
}
