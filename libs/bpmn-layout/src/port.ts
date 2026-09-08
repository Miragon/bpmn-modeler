import type { LayoutResult } from "./types";

/**
 * The seam between "compute a layout" and "apply it".
 *
 * The port speaks pure geometry rather than XML so a future in-memory
 * implementation need not reproduce an XML round trip, and so swapping the
 * engine leaves the applier, the commands and the hosts untouched.
 */
export interface LayoutEngine {
    /**
     * @param xml The current diagram, serialized.
     * @returns Absolute geometry for every element the engine laid out.
     * @throws LayoutEngineError when the engine could not produce a layout.
     */
    computeLayout(xml: string): Promise<LayoutResult>;
}

/**
 * Thrown by an adapter when the underlying engine fails.
 *
 * The original is carried as `reason` rather than the standard `cause`: the
 * consuming programs disagree on whether `Error.cause` exists in their lib, so
 * a distinct name keeps this compiling in both without a cast.
 */
export class LayoutEngineError extends Error {
    constructor(
        message: string,
        readonly reason?: unknown,
    ) {
        super(message);
        this.name = "LayoutEngineError";
    }
}
