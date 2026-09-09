import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

export function checkInlinedPeers({
    packageRoot = PACKAGE_ROOT,
    configPath = resolve(packageRoot, "inlined-libraries.json"),
    manifestPath = resolve(packageRoot, "package.json"),
} = {}) {
    const libraries = readJson(configPath);
    const manifest = readJson(manifestPath);
    const runtimeDependencies = manifest.dependencies ?? {};
    const missing = [];

    for (const library of libraries) {
        const libraryManifestPath = resolve(packageRoot, library.sourceRoot, "..", "package.json");
        const libraryManifest = readJson(libraryManifestPath);

        if (libraryManifest.name !== library.name) {
            throw new Error(
                `inlined library config mismatch: ${library.name} points to ` +
                    `${libraryManifest.name ?? libraryManifestPath}`,
            );
        }

        for (const peer of Object.keys(libraryManifest.peerDependencies ?? {})) {
            if (!(peer in runtimeDependencies)) {
                missing.push(`${library.name} requires ${peer}`);
            }
        }
    }

    if (missing.length > 0) {
        throw new Error(
            "inlined library peers must be published runtime dependencies:\n" +
                missing.map((item) => `  - ${item}`).join("\n"),
        );
    }

    return { checkedLibraries: libraries.length };
}

function isMain() {
    return process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMain()) {
    try {
        const { checkedLibraries } = checkInlinedPeers();
        console.log(`check-inlined-peers: checked ${checkedLibraries} inlined libraries.`);
    } catch (error) {
        console.error(`check-inlined-peers: ${error.message}`);
        process.exitCode = 1;
    }
}
