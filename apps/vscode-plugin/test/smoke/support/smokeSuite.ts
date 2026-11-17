import { copyFile, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { FrameLocator } from "playwright-core";
import { afterAll, afterEach, beforeAll, beforeEach, expect, inject } from "vitest";

import { VsCodeSession } from "../vscodeSession";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const RESULTS_ROOT = join(REPOSITORY_ROOT, "test-results/vscode-smoke");
const FIXTURES_DIRECTORY = fileURLToPath(new URL("../fixtures/", import.meta.url));

const TIMEOUT_MS = 30_000;
/** `Default Light+` exists in every VS Code down to the engines floor; the `Modern` themes do not. */
const DEFAULT_COLOR_THEME = "Default Light+";
const CUSTOM_EDITORS = {
    "*.bpmn": "bpmn-modeler.bpmn",
    "*.dmn": "bpmn-modeler.dmn",
    "*.form": "bpmn-modeler.form",
};

export interface SmokeSuiteOptions {
    /** The suite's folder below `test-results/vscode-smoke`. */
    name: string;
    /** Fills the folder every test's workspace is restored from. */
    workspace: (directory: string) => Promise<void>;
    colorTheme?: string;
    /**
     * Starts every test in a new window on an empty profile, for a suite whose
     * tests change what the extension stores for the user, such as allowances.
     */
    freshProfile?: boolean;
}

export interface SmokeSuite {
    vscode(): VsCodeSession;
    /** The profile's folder, with `user-data` in it. */
    rootDirectory(): string;
    /** The absolute path of a file of the workspace. */
    file(...segments: string[]): string;
    /** Opens a workspace file in its custom editor and returns the editor's webview. */
    open(
        fileName: string,
        isRendered: (webview: FrameLocator) => Promise<boolean>,
    ): Promise<FrameLocator>;
    screenshot(name: string): Promise<void>;
}

/** A workspace of the named smoke fixtures, files or folders. */
export function fixtures(...names: string[]): (directory: string) => Promise<void> {
    return async (directory) => {
        for (const name of names) {
            await cp(join(FIXTURES_DIRECTORY, name), join(directory, name), { recursive: true });
        }
    };
}

async function filesBelow(directory: string): Promise<{ files: string[]; folders: string[] }> {
    const entries = await readdir(directory, { recursive: true, withFileTypes: true });
    const pathOf = (entry: (typeof entries)[number]) =>
        relative(directory, join(entry.parentPath, entry.name));
    return {
        files: entries.filter((entry) => !entry.isDirectory()).map(pathOf),
        folders: entries.filter((entry) => entry.isDirectory()).map(pathOf),
    };
}

/**
 * Makes `workspace` equal to `template` and writes only what differs, so the
 * watchers of VS Code and of the extension see a change only where a test made one.
 */
async function restoreWorkspace(template: string, workspace: string): Promise<void> {
    await mkdir(workspace, { recursive: true });
    const wanted = await filesBelow(template);
    const present = await filesBelow(workspace);
    const keeps = new Set([...wanted.files, ...wanted.folders]);
    const removed: string[] = [];
    for (const path of [...present.folders, ...present.files].sort()) {
        if (keeps.has(path) || removed.some((folder) => path.startsWith(folder + sep))) continue;
        removed.push(path);
        await rm(join(workspace, path), { recursive: true, force: true });
    }
    for (const folder of wanted.folders) await mkdir(join(workspace, folder), { recursive: true });
    for (const file of wanted.files) {
        const original = await readFile(join(template, file));
        const current = await readFile(join(workspace, file)).catch(() => undefined);
        if (!current?.equals(original)) await copyFile(join(template, file), join(workspace, file));
    }
}

/**
 * One VS Code window for the tests of a file. Every test starts with the
 * workspace as the suite built it and a window without editors, so a test
 * opens what it needs and depends on no test before it. A failed test leaves
 * a screenshot and a focus report, and the next one gets a new window: a
 * stuck window fails one test, not the rest of the file.
 */
export function smokeSuite(options: SmokeSuiteOptions): SmokeSuite {
    const run = inject("smokeRun");
    const resultsDirectory = join(RESULTS_ROOT, options.name);
    let rootDirectory = "";
    let templateDirectory = "";
    let workspaceDirectory = "";
    let session: VsCodeSession | undefined;
    let needsNewWindow = false;
    /** No test has used the window yet, so it needs no reset. */
    let isFreshWindow = false;
    let hasFailure = false;

    const vscode = (): VsCodeSession => {
        if (!session) throw new Error("VS Code did not start");
        return session;
    };

    /** The logs live in the profile, which a fresh one deletes. */
    async function keepLogsOfFailure(): Promise<void> {
        if (!hasFailure) return;
        await cp(join(rootDirectory, "user-data", "logs"), join(resultsDirectory, "vscode-logs"), {
            recursive: true,
        }).catch(() => undefined);
    }

    async function openWindow(): Promise<void> {
        await session?.close();
        session = undefined;
        if (options.freshProfile) {
            await keepLogsOfFailure();
            await rm(join(rootDirectory, "user-data"), { recursive: true, force: true });
        }
        await restoreWorkspace(templateDirectory, workspaceDirectory);
        session = await VsCodeSession.launch({
            executablePath: run.executablePath,
            extensionPath: run.extensionPath,
            extensionId: run.extensionId,
            rootDirectory,
            workspaceDirectory,
            customEditors: CUSTOM_EDITORS,
            colorTheme: options.colorTheme ?? DEFAULT_COLOR_THEME,
            timeoutMs: TIMEOUT_MS,
        });
        needsNewWindow = false;
        isFreshWindow = true;
    }

    async function saveFailureEvidence(testName: string, attempt: number): Promise<void> {
        const name = `failure-${testName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${attempt ? `-retry-${attempt}` : ""}`;
        await session?.screenshot(join(resultsDirectory, `${name}.png`)).catch(() => undefined);
        const focus = await session?.focusReport().catch((error: unknown) => String(error));
        await writeFile(
            join(resultsDirectory, `${name}.focus.json`),
            JSON.stringify(focus, null, 2),
        ).catch(() => undefined);
    }

    beforeAll(async () => {
        await rm(resultsDirectory, { recursive: true, force: true });
        await mkdir(resultsDirectory, { recursive: true });
        rootDirectory = await mkdtemp(join(run.runRoot, "s-"));
        templateDirectory = join(rootDirectory, "workspace-template");
        workspaceDirectory = join(rootDirectory, "workspace");
        await mkdir(templateDirectory);
        await options.workspace(templateDirectory);
        await openWindow();
    });

    beforeEach(async () => {
        if (!session || needsNewWindow || (options.freshProfile && !isFreshWindow)) {
            await openWindow();
        } else if (!isFreshWindow) {
            try {
                await session.resetWorkbench();
                await restoreWorkspace(templateDirectory, workspaceDirectory);
            } catch (error) {
                console.log(`[${options.name}] a new window, the last one did not reset: ${error}`);
                await openWindow();
            }
        }
        isFreshWindow = false;
    });

    afterEach(async ({ task }) => {
        const cspViolations = session?.takeCspViolations() ?? [];
        if (task.result?.state === "fail" || cspViolations.length > 0) {
            hasFailure = true;
            needsNewWindow = true;
            await saveFailureEvidence(task.name, task.result?.retryCount ?? 0);
        }
        expect(cspViolations, "Content Security Policy violations during the test").toEqual([]);
    });

    afterAll(async () => {
        await session?.close();
        await keepLogsOfFailure();
        if (rootDirectory) await rm(rootDirectory, { recursive: true, force: true });
    });

    return {
        vscode,
        rootDirectory: () => rootDirectory,
        file: (...segments) => join(workspaceDirectory, ...segments),
        async open(fileName, isRendered) {
            await vscode().openInCustomEditor(join(workspaceDirectory, fileName), isRendered);
            return vscode().webview();
        },
        async screenshot(name) {
            const path = join(resultsDirectory, `${name}.png`);
            await mkdir(dirname(path), { recursive: true });
            await vscode().screenshot(path);
        },
    };
}
