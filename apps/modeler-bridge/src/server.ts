/**
 * Stdio entrypoint for the out-of-process modeler core, shipped as a Node-free
 * Bun binary (`bun build --compile`). All wiring lives in {@link createBridge}
 * and `stdioBinding`; this file only binds the process streams, so the rest
 * stays unit-testable.
 *
 * stdout is the RPC channel and must carry nothing else; all diagnostics go to
 * stderr (the host pipes that into the IDE log).
 */

import { homedir } from "node:os";
import { join } from "node:path";

import { createBridge } from "./composition/bridge";
import { coreLogText, createStdinEndHandler, createStdinHandler } from "./composition/stdioBinding";

// The host (IntelliJ) sets this to a `PathManager`-derived location segmented by
// the project's location hash (per-project, shared only among windows on that
// project); absent, fall back to a stable home-dir path so a standalone/dev run
// still caches somewhere deterministic.
const marketplaceCacheRoot =
    process.env.MIRAGON_BPMN_MARKETPLACE_CACHE ??
    join(homedir(), ".miragon-bpmn-modeler", "marketplaces");

// The IntelliJ host sets this to a folder of its system path, shared by every
// project, which its webview server serves; keep the name in sync with
// `BridgeProcessLauncher.kt`. Absent, `createBridge` falls back to a home-dir path.
const pluginCacheRoot = process.env.MIRAGON_BPMN_PLUGIN_CACHE;

const { rpc, prunePluginCache, migrateContentRows } = createBridge(
    (line) => process.stdout.write(line + "\n"),
    (message) => process.stderr.write(coreLogText(message)),
    { marketplaceCacheRoot, pluginCacheRoot, homeDir: homedir() },
);

process.stdin.setEncoding("utf8");
process.stdin.on(
    "data",
    createStdinHandler(rpc, (text) => process.stderr.write(text)),
);
process.stdin.on(
    "end",
    createStdinEndHandler(rpc, () => process.exit(0)),
);

// stdin EOF is the normal teardown, but the host also sends SIGTERM (its
// graceful `Process.destroy()` before a force-kill fallback). Exit promptly on
// it so a slow EOF can't leave the process to be SIGKILL'd after the host's
// grace window.
process.on("SIGTERM", () => process.exit(0));

process.stderr.write(coreLogText("modeler-core bridge ready"));

// After the streams are bound, as they log through them; the rewrite also asks the host for its list.
void prunePluginCache();
void migrateContentRows();
