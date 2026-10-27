/**
 * The part of the stdio entry point that touches no process stream, so it can
 * be tested without spawning the binary.
 */

import { createLineSplitter } from "./lineFraming";
import type { Rpc } from "./rpc";

/** A diagnostic for stderr, tagged so the IDE log tells the core's lines apart. */
export function coreLogText(message: string): string {
    return `[core] ${message}\n`;
}

/**
 * Feeds each newline-delimited stdin frame to the RPC peer. A frame that fails
 * past every handler is logged, so one bad frame never stops the bridge.
 */
export function createStdinHandler(
    rpc: Pick<Rpc, "handleLine">,
    writeStderr: (text: string) => void,
): (chunk: string) => void {
    return createLineSplitter((line) => {
        void rpc.handleLine(line).catch((error: unknown) => {
            writeStderr(
                coreLogText(
                    `handler error: ${error instanceof Error ? error.message : String(error)}`,
                ),
            );
        });
    });
}
