// Version-skew guard (issue #1379): the published package ships the bpmn-io
// stack as real `dependencies`, but the same libraries are also declared by the
// in-repo consumers (bpmn-webview and the private feature libs) that bundle the
// package from source. If a consumer bumps, say, `bpmn-js` and this package does
// not, the webview and the npm tarball drift onto two copies — the classic
// "works in the monorepo, breaks for installers" split.
//
// This dependency-free script fails the build when:
//   1. Alignment — any *other* workspace manifest that declares a name this
//      package lists in `dependencies` pins a *different* exact version.
//   2. Lockfile sanity — each of this package's dependency pins has a matching
//      `<name>@npm:<pin>` descriptor in the root `yarn.lock` resolving to exactly
//      that version. (We do NOT demand a single version repo-wide: transitive
//      ranges legitimately resolve elsewhere.)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "../..");

function fail(messages) {
    console.error("check-dep-alignment: version skew detected:\n  " + messages.join("\n  "));
    process.exit(1);
}

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

const selfManifest = readJson(join(packageDir, "package.json"));
const selfDeps = selfManifest.dependencies ?? {};

// Discover every other workspace manifest: apps/*, libs/*, packages/* and docs.
function workspaceManifests() {
    const manifests = [];
    for (const group of ["apps", "libs", "packages"]) {
        const groupDir = join(repoRoot, group);
        let entries;
        try {
            entries = readdirSync(groupDir);
        } catch {
            continue;
        }
        for (const entry of entries) {
            const manifestPath = join(groupDir, entry, "package.json");
            try {
                if (statSync(manifestPath).isFile()) {
                    manifests.push(manifestPath);
                }
            } catch {
                // no manifest in this dir — skip
            }
        }
    }
    const docsManifest = join(repoRoot, "docs", "package.json");
    try {
        if (statSync(docsManifest).isFile()) manifests.push(docsManifest);
    } catch {
        // docs may not ship a manifest — skip
    }
    return manifests;
}

const failures = [];

// 1. Alignment across sibling workspaces.
for (const manifestPath of workspaceManifests()) {
    if (manifestPath === join(packageDir, "package.json")) continue;
    const manifest = readJson(manifestPath);
    const declared = { ...(manifest.devDependencies ?? {}), ...(manifest.dependencies ?? {}) };
    const rel = manifestPath.slice(repoRoot.length + 1);
    for (const [name, pin] of Object.entries(selfDeps)) {
        const otherRange = declared[name];
        if (otherRange !== undefined && otherRange !== pin) {
            failures.push(
                `${name}: package pins "${pin}" but ${rel} declares "${otherRange}" — align both to one exact version.`,
            );
        }
    }
}

// 2. Lockfile sanity — each pin has a matching descriptor resolving to that version.
const lockfile = readFileSync(join(repoRoot, "yarn.lock"), "utf8").split("\n");

function lockedVersionFor(name, pin) {
    const descriptor = `${name}@npm:${pin}`;
    for (let i = 0; i < lockfile.length; i++) {
        const line = lockfile[i];
        // Descriptor keys are top-level (unindented), end in `:`, and may bundle
        // several comma-separated descriptors on one line, each optionally quoted.
        if (line.length === 0 || line[0] === " " || !line.trimEnd().endsWith(":")) continue;
        const key = line.trimEnd().slice(0, -1);
        const descriptors = key.split(",").map((d) => d.trim().replace(/^"|"$/g, ""));
        if (!descriptors.includes(descriptor)) continue;
        for (let j = i + 1; j < lockfile.length && lockfile[j].startsWith(" "); j++) {
            const match = lockfile[j].match(/^\s+version:\s*"?([^"\s]+)"?\s*$/);
            if (match) return match[1];
        }
        return null;
    }
    return undefined;
}

for (const [name, pin] of Object.entries(selfDeps)) {
    // Only exact-version pins are checked against the lockfile; a range dep would
    // need range-aware resolution the alignment rule above already discourages.
    if (!/^\d/.test(pin)) continue;
    const locked = lockedVersionFor(name, pin);
    if (locked === undefined) {
        failures.push(
            `${name}@npm:${pin}: no matching descriptor in yarn.lock (run yarn install).`,
        );
    } else if (locked !== null && locked !== pin) {
        failures.push(`${name}@npm:${pin}: yarn.lock resolves this descriptor to ${locked}.`);
    }
}

if (failures.length > 0) fail(failures);

console.log(
    "check-dep-alignment: package dependencies are aligned with all consumers and the lockfile.",
);
