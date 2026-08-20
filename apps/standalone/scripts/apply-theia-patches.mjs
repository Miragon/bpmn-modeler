import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const requireFromStandalone = createRequire(
    resolve(repositoryRoot, "apps/standalone/package.json"),
);

function tryResolve(specifier, requireFrom = requireFromStandalone) {
    try {
        return requireFrom.resolve(specifier);
    } catch (error) {
        if (error?.code === "MODULE_NOT_FOUND") {
            return undefined;
        }
        throw error;
    }
}

if (!tryResolve("@theia/secondary-window/package.json")) {
    console.log("Skipping Theia patches: standalone dependencies are not installed.");
    process.exit(0);
}

const cliPackageJson = tryResolve("@theia/cli/package.json");
if (!cliPackageJson) {
    throw new Error("Cannot apply Theia patches because @theia/cli is not installed.");
}

const patchesDirectory = resolve(dirname(cliPackageJson), "patches");
if (!existsSync(patchesDirectory)) {
    throw new Error(`Cannot find Theia patches at ${patchesDirectory}.`);
}
const patchesDirectoryFromRoot = relative(repositoryRoot, patchesDirectory);

const requireFromCli = createRequire(cliPackageJson);
const patchPackage = tryResolve("patch-package", requireFromCli);
if (!patchPackage) {
    throw new Error("Cannot apply Theia patches because patch-package is not installed.");
}

const result = spawnSync(
    process.execPath,
    [patchPackage, "--patch-dir", patchesDirectoryFromRoot],
    {
        cwd: repositoryRoot,
        env: process.env,
        stdio: "inherit",
    },
);

if (result.error) {
    throw result.error;
}
if (result.signal) {
    throw new Error(`Theia patch process terminated with signal ${result.signal}.`);
}
if (result.status !== 0) {
    process.exit(result.status ?? 1);
}
