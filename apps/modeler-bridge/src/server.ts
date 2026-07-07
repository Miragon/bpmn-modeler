/**
 * Stdio entrypoint for the out-of-process modeler core, shipped as a Node-free
 * Bun binary (`bun build --compile`). All wiring lives in {@link createBridge};
 * this file is only the stdio binding so the wiring stays unit-testable.
 *
 * stdout is the RPC channel and must carry nothing else; all diagnostics go to
 * stderr (the host pipes that into the IDE log).
 */

import { homedir } from "node:os";
import { join } from "node:path";

import { createBridge } from "./bridge";

// The host (IntelliJ) sets this to a `PathManager`-derived, per-machine location
// shared across project windows; absent, fall back to a stable home-dir path so a
// standalone/dev run still caches somewhere deterministic.
const marketplaceCacheRoot =
    process.env.MIRAGON_BPMN_MARKETPLACE_CACHE ??
    join(homedir(), ".miragon-bpmn-modeler", "marketplaces");

const { rpc } = createBridge(
    (line) => process.stdout.write(line + "\n"),
    (message) => process.stderr.write(`[core] ${message}\n`),
    { marketplaceCacheRoot, homeDir: homedir() },
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

// stdin EOF is the normal teardown, but the host also sends SIGTERM (its
// graceful `Process.destroy()` before a force-kill fallback). Exit promptly on
// it so a slow EOF can't leave the process to be SIGKILL'd after the host's
// grace window.
process.on("SIGTERM", () => process.exit(0));

process.stderr.write("[core] modeler-core bridge ready\n");
