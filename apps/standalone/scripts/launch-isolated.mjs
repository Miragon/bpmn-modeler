#!/usr/bin/env node
// Launch the packaged app with a throw-away $HOME so no state persists across
// runs. Node port of the original bash script — works on macOS and Windows
// without depending on `uname`, `mktemp`, or shell-specific globbing.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", "dist");

function fail(message) {
    console.error(message);
    console.error("Run 'corepack yarn workspace @miragon/bpmn-modeler-standalone package' first.");
    process.exit(1);
}

function findBinary() {
    if (!existsSync(dist)) {
        fail(`dist/ not found at ${dist}.`);
    }
    const entries = readdirSync(dist);

    if (process.platform === "darwin") {
        // electron-builder writes mac-* (mac, mac-arm64, mac-universal, ...).
        const macDirs = entries
            .filter((e) => e.startsWith("mac"))
            .map((e) => join(dist, e))
            .filter((p) => statSync(p).isDirectory());
        for (const macDir of macDirs) {
            const app = readdirSync(macDir).find((f) => f.endsWith(".app"));
            if (app) {
                const name = app.replace(/\.app$/, "");
                return {
                    binary: join(macDir, app, "Contents", "MacOS", name),
                    isolate: (iso) => ({ env: { HOME: iso } }),
                };
            }
        }
        fail(`No unpacked .app found under ${dist}.`);
    }

    if (process.platform === "win32") {
        const unpacked = join(dist, "win-unpacked");
        if (!existsSync(unpacked)) fail(`Expected ${unpacked} to exist.`);
        const exe = readdirSync(unpacked).find((f) => f.endsWith(".exe"));
        if (!exe) fail(`No .exe in ${unpacked}.`);
        return {
            binary: join(unpacked, exe),
            isolate: (iso) => ({
                env: {
                    USERPROFILE: iso,
                    APPDATA: join(iso, "AppData", "Roaming"),
                    LOCALAPPDATA: join(iso, "AppData", "Local"),
                },
            }),
        };
    }

    fail(`Unsupported platform: ${process.platform}`);
}

const { binary, isolate } = findBinary();
const iso = mkdtempSync(join(tmpdir(), "miragon-iso-"));
const cleanup = () => {
    try {
        rmSync(iso, { recursive: true, force: true });
    } catch {
        /* best-effort */
    }
};
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

const { env: isolateEnv } = isolate(iso);
const result = spawnSync(binary, [], {
    stdio: "inherit",
    env: { ...process.env, ...isolateEnv },
});
process.exit(result.status ?? 0);
