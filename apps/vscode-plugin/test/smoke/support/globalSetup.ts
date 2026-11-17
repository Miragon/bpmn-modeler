import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { TestProject } from "vitest/node";

import { downloadVsCode, flatpakVSCodium, packExtension } from "../vscodeSession";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const DIST_DIRECTORY = join(REPOSITORY_ROOT, "dist/apps/vscode-plugin");

/** What every suite of a run shares: one packed extension and one VS Code. */
export interface SmokeRun {
    /** Holds the unpacked extension and every suite's profile and workspace. */
    runRoot: string;
    extensionPath: string;
    executablePath: string;
    extensionId: string;
}

declare module "vitest" {
    export interface ProvidedContext {
        smokeRun: SmokeRun;
    }
}

const log = (line: string) => console.log(`[vscode-smoke] ${line}`);

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
    const usesFlatpak = process.env.VSCODE_SMOKE_FLATPAK === "1";
    // Flatpak owns its /tmp; put its explicitly shared profile under the host home.
    const temporaryRoot = usesFlatpak ? join(homedir(), ".cache") : tmpdir();
    await mkdir(temporaryRoot, { recursive: true });
    const runRoot = await mkdtemp(join(temporaryRoot, "bpmn-smoke-"));
    const manifest = JSON.parse(
        await readFile(join(DIST_DIRECTORY, "package.json"), "utf8").catch(() => {
            throw new Error(`${DIST_DIRECTORY} holds no built extension: run \`yarn build\` first`);
        }),
    ) as { publisher: string; name: string };
    const extensionPath = await packExtension(DIST_DIRECTORY, runRoot);
    const executablePath = usesFlatpak
        ? await flatpakVSCodium(runRoot)
        : await downloadVsCode(extensionPath, process.env.VSCODE_SMOKE_VERSION || undefined, log);
    project.provide("smokeRun", {
        runRoot,
        extensionPath,
        executablePath,
        extensionId: `${manifest.publisher}.${manifest.name}`.toLowerCase(),
    });
    return () => rm(runRoot, { recursive: true, force: true });
}
