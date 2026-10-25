#!/usr/bin/env node
// Fails when a Vitest workspace would silently drop out of CI: every
// apps|libs|packages workspace with a Vitest config must be a target in
// .github/vitest-targets.json, its focused install must provide Vitest, its
// trigger paths must cover every workspace and file its tests import, and a
// build script that only typechecks must be its typecheck.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const registry = readJson(".github/vitest-targets.json");
const tsconfigPaths = readJson("tsconfig.base.json").compilerOptions.paths;
const WORKSPACE_PARENTS = ["apps", "libs", "packages"];
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SPEC_FILE = /\.(?:spec|test)\.[cm]?[jt]sx?$/;
const IMPORT_SPECIFIER =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*|\bvi\.(?:mock|doMock|importActual|importMock)\(\s*)["'`]([^"'`$]+)["'`]/g;
const TYPE_ONLY_STATEMENT =
    /^\s*(?:import|export)\s+type\s+(?!from\b)[^;]*?\bfrom\s*["'][^"'\n]+["']\s*;?\s*$/gm;
const SUPPORTED_GLOB = /^(?:[^*?[\]!]|\*(?!\*)|(?<=^|\/)\*\*(?=\/|$))+$/;
const TYPECHECK_ONLY_SCRIPT = /^tsc(?=\s[^&|;]*--noEmit\b)[^&|;]*$/;

const problems = [];
const targets = Object.entries(registry.targets);
const targetIdByDir = new Map(targets.map(([id, target]) => [target.dir, id]));
const manifestDirByName = new Map(
    [".", ...workspaceDirs()].map((dir) => [readJson(join(dir, "package.json")).name, dir]),
);

for (const glob of registry.global) {
    if (!SUPPORTED_GLOB.test(glob)) problems.push(`global: unsupported glob "${glob}"`);
}

for (const dir of workspacesWithVitestConfig()) {
    if (!targetIdByDir.has(dir)) {
        problems.push(
            `${dir} has a Vitest config but is not a target in .github/vitest-targets.json`,
        );
    }
}
for (const [id, target] of targets) {
    checkTarget(id, target);
}

if (problems.length > 0) {
    console.error(problems.map((problem) => `✗ ${problem}`).join("\n"));
    process.exit(1);
}
console.log(`✓ ${targets.length} Vitest targets cover every Vitest workspace`);

function checkTarget(id, target) {
    if (id === "changes" || id.endsWith("-src")) {
        problems.push(
            `${id}: ids named "changes" or ending in "-src" clash with paths-filter outputs`,
        );
    }
    const manifestPath = join(target.dir, "package.json");
    if (!existsSync(join(repoRoot, manifestPath))) {
        problems.push(`${id}: ${manifestPath} does not exist`);
        return;
    }
    const manifest = readJson(manifestPath);
    if (manifest.name !== target.package) {
        problems.push(
            `${id}: package "${target.package}" but ${manifestPath} is "${manifest.name}"`,
        );
    }
    if (!/\bvitest run\b.*--coverage/.test(manifest.scripts?.test ?? "")) {
        problems.push(`${id}: the "test" script must run "vitest run --coverage"`);
    }
    if (target.typecheck && !manifest.scripts?.[target.typecheck]) {
        problems.push(`${id}: typecheck script "${target.typecheck}" is missing`);
    }
    // Most typecheck-only builds run in no other CI job.
    if (!target.typecheck && TYPECHECK_ONLY_SCRIPT.test(manifest.scripts?.build ?? "")) {
        problems.push(`${id}: the "build" script only typechecks; set "typecheck": "build"`);
    }
    // `yarn workspaces focus` installs only what the focused workspaces declare;
    // vite is vitest's required peer, so it must be declared too.
    const focusedManifests = [target.package, ...(target.focus ?? [])]
        .map((name) => manifestDirByName.get(name))
        .filter((dir) => dir !== undefined)
        .map((dir) => readJson(join(dir, "package.json")));
    const provides = (dependency) =>
        focusedManifests.some(
            (focused) =>
                focused.dependencies?.[dependency] || focused.devDependencies?.[dependency],
        );
    const required = ["vitest", "vite", "@vitest/coverage-v8"];
    if (usesJsdom(target.dir)) required.push("jsdom");
    if (target.browser) required.push("@vitest/browser-playwright", "playwright");
    for (const dependency of required.filter((dependency) => !provides(dependency))) {
        problems.push(`${id}: no focused workspace declares ${dependency}`);
    }
    for (const glob of target.paths.filter((path) => !SUPPORTED_GLOB.test(path))) {
        problems.push(`${id}: unsupported glob "${glob}" (use whole-segment ** and *, {a,b})`);
    }
    const triggers = [...target.paths, ...registry.global].map(globToRegExp);
    const isTriggered = (path) => triggers.some((trigger) => trigger.test(path));
    for (const reachable of reachablePaths(target.dir)) {
        if (!isTriggered(reachable)) {
            problems.push(`${id}: tests reach ${reachable}, which no trigger path covers`);
        }
    }
}

function reachablePaths(targetDir) {
    const reachable = new Set([`${targetDir}/package.json`]);
    const scannedWorkspaces = new Set();
    const scannedFiles = new Set();
    const pendingFiles = [];
    const enqueueWorkspace = (dir, includeSpecs) => {
        if (scannedWorkspaces.has(dir)) return;
        scannedWorkspaces.add(dir);
        const files = sourceFiles(join(dir, "src"));
        pendingFiles.push(...files.filter((file) => includeSpecs || !SPEC_FILE.test(file)));
    };
    enqueueWorkspace(targetDir, true);
    while (pendingFiles.length > 0) {
        const file = pendingFiles.pop();
        if (scannedFiles.has(file)) continue;
        scannedFiles.add(file);
        for (const specifier of importSpecifiers(file)) {
            if (specifier.startsWith(".")) {
                const importedPath = relative(
                    repoRoot,
                    resolve(repoRoot, dirname(file), specifier),
                );
                if (importedPath.startsWith(`${targetDir}/`)) continue;
                reachable.add(importedPath);
                const importedFile = existingSourceFile(importedPath);
                if (importedFile) pendingFiles.push(importedFile);
            } else {
                const importedWorkspace = aliasedWorkspace(specifier);
                if (!importedWorkspace || importedWorkspace === targetDir) continue;
                reachable.add(`${importedWorkspace}/src/index.ts`);
                enqueueWorkspace(importedWorkspace, false);
            }
        }
    }
    return reachable;
}

function existingSourceFile(path) {
    return ["", ".ts", ".tsx", ".mts", ".js", ".mjs", "/index.ts"]
        .map((suffix) => `${path}${suffix}`)
        .find((candidate) => SOURCE_FILE.test(candidate) && isFile(candidate));
}

function isFile(path) {
    return existsSync(join(repoRoot, path)) && statSync(join(repoRoot, path)).isFile();
}

function aliasedWorkspace(specifier) {
    const match = Object.keys(tsconfigPaths)
        .map((key) => key.replace(/\/\*$/, ""))
        .filter((key) => specifier === key || specifier.startsWith(`${key}/`))
        .sort((a, b) => b.length - a.length)[0];
    if (!match) return undefined;
    const [target] = tsconfigPaths[match] ?? tsconfigPaths[`${match}/*`];
    return workspaceOf(relative(repoRoot, resolve(repoRoot, target)));
}

function workspaceOf(path) {
    const [parent, name] = path.split("/");
    return WORKSPACE_PARENTS.includes(parent) && name ? `${parent}/${name}` : undefined;
}

function importSpecifiers(file) {
    const source = readFileSync(join(repoRoot, file), "utf8").replace(TYPE_ONLY_STATEMENT, "");
    return [...source.matchAll(IMPORT_SPECIFIER)].map(([, specifier]) => specifier);
}

function usesJsdom(dir) {
    const configMentionsJsdom = readdirSync(join(repoRoot, dir))
        .filter((name) => /^vitest(?:\.[\w-]+)?\.config\./.test(name))
        .some((name) => readFileSync(join(repoRoot, dir, name), "utf8").includes('"jsdom"'));
    return (
        configMentionsJsdom ||
        sourceFiles(join(dir, "src")).some(
            (file) =>
                SPEC_FILE.test(file) &&
                readFileSync(join(repoRoot, file), "utf8").includes("@vitest-environment jsdom"),
        )
    );
}

function workspaceDirs() {
    return WORKSPACE_PARENTS.flatMap((parent) =>
        readdirSync(join(repoRoot, parent))
            .map((name) => `${parent}/${name}`)
            .filter((dir) => existsSync(join(repoRoot, dir, "package.json"))),
    );
}

function workspacesWithVitestConfig() {
    return workspaceDirs().filter((dir) =>
        readdirSync(join(repoRoot, dir)).some((name) =>
            /^vitest(?:\.[\w-]+)?\.config\.[cm]?[jt]s$/.test(name),
        ),
    );
}

function sourceFiles(dir) {
    const absolute = join(repoRoot, dir);
    if (!existsSync(absolute)) return [];
    return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(path);
        return SOURCE_FILE.test(entry.name) ? [path] : [];
    });
}

function globToRegExp(glob) {
    let pattern = "";
    for (let index = 0; index < glob.length; index++) {
        const char = glob[index];
        if (char === "*" && glob[index + 1] === "*") {
            const slashFollows = glob[index + 2] === "/";
            pattern += slashFollows ? "(?:.*/)?" : ".*";
            index += slashFollows ? 2 : 1;
        } else if (char === "*") pattern += "[^/]*";
        else if (char === "{") pattern += "(?:";
        else if (char === "}") pattern += ")";
        else if (char === ",") pattern += "|";
        else pattern += char.replace(/[.+?^$()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`^${pattern}$`);
}

function readJson(path) {
    return JSON.parse(readFileSync(join(repoRoot, path), "utf8"));
}
