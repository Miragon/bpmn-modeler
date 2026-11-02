/**
 * The part of the stdio entry point that touches no process stream, so it can
 * be tested without spawning the binary.
 */

import { errorLogText } from "@miragon/bpmn-modeler-core";

import { createLineSplitter } from "./lineFraming";
import type { Rpc } from "./rpc";

// The host reads stderr line by line and splits at a lone carriage return too.
const HOST_LINE_BREAK = /\r\n?|\n/;

/**
 * A diagnostic for stderr. Every line carries the tag, so the lines of a stack
 * stay attributable to the core once the host has logged them one by one.
 */
export function coreLogText(message: string): string {
    return message
        .split(HOST_LINE_BREAK)
        .map((line) => `[core] ${line}\n`)
        .join("");
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
            writeStderr(coreLogText(`handler error: ${errorLogText(error)}`));
        });
    });
}

/** Once stdin ends the host can answer no request, so every request fails before the bridge exits. */
export function createStdinEndHandler(rpc: Pick<Rpc, "handleEnd">, exit: () => void): () => void {
    return () => {
        rpc.handleEnd();
        exit();
    };
}
