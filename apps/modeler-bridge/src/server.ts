/**
 * Stdio entrypoint for the out-of-process modeler core, shipped as a Node-free
 * Bun binary (`bun build --compile`). All wiring lives in {@link createBridge};
 * this file is only the stdio binding so the wiring stays unit-testable.
 *
 * stdout is the RPC channel and must carry nothing else; all diagnostics go to
 * stderr (the host pipes that into the IDE log).
 */

import { createBridge } from "./bridge";

const { rpc } = createBridge(
    (line) => process.stdout.write(line + "\n"),
    (message) => process.stderr.write(`[core] ${message}\n`),
);

// Read stdin as newline-delimited JSON frames.
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        void rpc.handleLine(line).catch((error: unknown) => {
            process.stderr.write(
                `[core] handler error: ${error instanceof Error ? error.message : String(error)}\n`,
            );
        });
        newline = buffer.indexOf("\n");
    }
});
process.stdin.on("end", () => process.exit(0));

process.stderr.write("[core] modeler-core bridge ready\n");
