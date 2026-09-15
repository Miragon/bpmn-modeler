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
    const inlinedNames = new Set(libraries.map((library) => library.name));
    const missingPeers = [];
    const missingDependencies = [];

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
                missingPeers.push(`${library.name} requires ${peer}`);
            }
        }

        // The vite build externalizes lib `dependencies` too — every one must
        // resolve for a consumer, either as a published runtime dependency or
        // by being another inlined lib (lib→lib, bundled away at build time).
        for (const dependency of Object.keys(libraryManifest.dependencies ?? {})) {
            if (!(dependency in runtimeDependencies) && !inlinedNames.has(dependency)) {
                missingDependencies.push(`${library.name} depends on ${dependency}`);
            }
        }
    }

    const failures = [];
    if (missingPeers.length > 0) {
        failures.push(
            "inlined library peers must be published runtime dependencies:\n" +
                missingPeers.map((item) => `  - ${item}`).join("\n"),
        );
    }
    if (missingDependencies.length > 0) {
        failures.push(
            "inlined library runtime dependencies must be published runtime " +
                "dependencies or themselves inlined libraries:\n" +
                missingDependencies.map((item) => `  - ${item}`).join("\n"),
        );
    }
    if (failures.length > 0) {
        throw new Error(failures.join("\n"));
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
