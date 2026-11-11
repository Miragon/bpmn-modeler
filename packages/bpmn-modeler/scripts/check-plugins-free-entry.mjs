// Plugin code runs with the page's full authority, so only a consumer that imports
// `/plugins` may ship the loader; no other entry may reach it, not even lazily.
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { collectModuleSpecifiers } from "./check-externals.mjs";

const DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const PLUGIN_FREE_ENTRIES = ["index.js", "design.js", "mode.js"];
const PLUGINS_ENTRY = "plugins.js";
// Rolldown starts each source module with a `// <id>` line comment, the only trace
// of where minified plugin code came from once it lands in a shared chunk.
const PLUGIN_CODE_MARKER = "// src/plugins/";
const PLUGIN_CODE_LINE = /^\/\/ src\/plugins\//m;

function reachableFiles(entry) {
    const visited = new Set();
    const queue = [entry];
    while (queue.length > 0) {
        const file = queue.pop();
        if (visited.has(file)) continue;
        visited.add(file);
        for (const specifier of collectModuleSpecifiers(readFileSync(file, "utf8"), file)) {
            if (!specifier.startsWith(".")) continue;
            const resolved = resolve(dirname(file), specifier);
            if (existsSync(resolved)) queue.push(resolved);
        }
    }
    return [...visited];
}

export function checkPluginsFreeEntries({ distDir = DIST_DIR } = {}) {
    const pluginsEntry = resolve(distDir, PLUGINS_ENTRY);
    for (const name of [...PLUGIN_FREE_ENTRIES, PLUGINS_ENTRY]) {
        if (!existsSync(resolve(distDir, name))) {
            throw new Error(`${resolve(distDir, name)} not found — run the lib build first.`);
        }
    }

    const holdsPluginCode = (file) =>
        file === pluginsEntry || PLUGIN_CODE_LINE.test(readFileSync(file, "utf8"));

    const pluginsGraphHasMarker = reachableFiles(pluginsEntry).some((file) =>
        PLUGIN_CODE_LINE.test(readFileSync(file, "utf8")),
    );
    if (!pluginsGraphHasMarker) {
        throw new Error(
            `${PLUGINS_ENTRY} and its chunks carry no "${PLUGIN_CODE_MARKER}" comment, so this ` +
                `check cannot tell plugin code apart; update its marker to the bundler's output.`,
        );
    }

    const offenders = PLUGIN_FREE_ENTRIES.flatMap((name) => {
        const entry = resolve(distDir, name);
        return reachableFiles(entry)
            .filter(holdsPluginCode)
            .map((file) => `${name} → ${relative(distDir, file)}`);
    });
    if (offenders.length > 0) {
        throw new Error(
            `an entry reaches the plugin loader, which must stay behind the /plugins ` +
                `subpath:\n  ${offenders.join("\n  ")}`,
        );
    }

    return { checkedEntries: PLUGIN_FREE_ENTRIES };
}

function isMain() {
    return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
    try {
        const { checkedEntries } = checkPluginsFreeEntries();
        console.log(
            `check-plugins-free-entry: ${checkedEntries.join(", ")} and their chunks hold no plugin code.`,
        );
    } catch (error) {
        console.error(`check-plugins-free-entry: ${error.message}`);
        process.exitCode = 1;
    }
}
