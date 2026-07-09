#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const standaloneDir = resolve(here, "..");
const repoRoot = resolve(standaloneDir, "..", "..");
const distDir = resolve(standaloneDir, "dist");
const manifestPath = resolve(standaloneDir, "flatpak", "io.miragon.BpmnModeler.yml");
const linuxUnpackedDir = resolve(distDir, "linux-unpacked");
const flatpakBuildDir = resolve(distDir, "flatpak-build");
const flatpakRepoDir = resolve(distDir, "flatpak-repo");
const appId = "io.miragon.BpmnModeler";

function fail(message) {
    console.error(message);
    process.exit(1);
}

function run(command, args) {
    execFileSync(command, args, { cwd: repoRoot, stdio: "inherit" });
}

function assertTool(command, installHint) {
    try {
        execFileSync(command, ["--version"], { stdio: "ignore" });
    } catch {
        fail(`${command} is required. ${installHint}`);
    }
}

function flatpakArch() {
    if (process.arch === "x64") return "x86_64";
    if (process.arch === "arm64") return "aarch64";
    return process.arch;
}

if (process.platform !== "linux") {
    fail("Flatpak bundles must be built on Linux.");
}

if (!existsSync(linuxUnpackedDir)) {
    fail(
        `Expected ${linuxUnpackedDir} to exist. Run ` +
            "`corepack yarn workspace @miragon/bpmn-modeler-standalone run package:linux:dir` first.",
    );
}

assertTool(
    "flatpak-builder",
    "Install it with your distribution package manager, for example `sudo apt install flatpak-builder`.",
);
assertTool(
    "flatpak",
    "Install it with your distribution package manager, for example `sudo apt install flatpak`.",
);

const { version } = JSON.parse(readFileSync(resolve(standaloneDir, "package.json"), "utf8"));
const bundlePath = resolve(distDir, `Miragon.BPMN.Modeler-${version}-${flatpakArch()}.flatpak`);

rmSync(bundlePath, { force: true });

run("flatpak-builder", [
    "--force-clean",
    "--user",
    "--install-deps-from=flathub",
    `--repo=${flatpakRepoDir}`,
    flatpakBuildDir,
    manifestPath,
]);

run("flatpak", [
    "build-bundle",
    flatpakRepoDir,
    bundlePath,
    appId,
    "--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo",
]);

console.log(`Flatpak bundle: ${bundlePath}`);
