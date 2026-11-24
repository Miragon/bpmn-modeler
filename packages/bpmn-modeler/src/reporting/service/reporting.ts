/**
 * One warn/error surface shared by the facades. Warnings mirror to `console.warn`
 * and an optional host sink; errors go to the host's `onError` if set, else
 * `console.error` (see docs/adr/bpmn-modeler.md#mode-session-and-lifecycle).
 * Disposal-race suppression is the caller's concern — see {@link wireContentSaved}.
 */
export interface SurfaceReporter {
    warn(message: string): void;
    reportError(error: unknown): void;
}

export function createReporter(sinks: {
    onWarning?: (message: string) => void;
    onError?: (error: unknown) => void;
}): SurfaceReporter {
    return {
        warn(message: string): void {
            console.warn(message);
            sinks.onWarning?.(message);
        },
        reportError(error: unknown): void {
            if (sinks.onError) {
                sinks.onError(error);
            } else {
                console.error(error);
            }
        },
    };
}
