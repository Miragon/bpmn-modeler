import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { downloadAndUnzipVSCode, type ProgressReport } from "@vscode/test-electron";
import {
    _electron as electron,
    type ElectronApplication,
    type FrameLocator,
    type Page,
} from "playwright-core";

const runFile = promisify(execFile);
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export const COMMAND_KEY = process.platform === "darwin" ? "Meta" : "Control";

const WINDOW_SIZE = { width: 1280, height: 800 };
const REOPEN_INTERVAL_MS = 2_000;
const CLOSE_TIMEOUT_MS = 10_000;

/**
 * Packs the built extension the way the release workflow does and unpacks the
 * VSIX outside the repository, so a module webpack did not bundle fails the
 * activation as it would for a user instead of resolving from node_modules.
 */
export async function packExtension(distDirectory: string, into: string): Promise<string> {
    const vsix = join(into, "vs-code-bpmn-modeler.vsix");
    const vsce = createRequire(import.meta.url).resolve("@vscode/vsce/vsce");
    await runFile(
        process.execPath,
        [vsce, "package", "--yarn", "--no-dependencies", "--out", vsix],
        { cwd: distDirectory },
    );
    await runFile("unzip", ["-q", vsix, "extension/*", "-d", into]);
    return join(into, "extension");
}

/** Outside every repository, so neither ESLint nor Prettier walks the unpacked VS Code. */
function vsCodeCachePath(): string {
    const cacheHome =
        process.platform === "darwin"
            ? join(homedir(), "Library", "Caches")
            : process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
    return join(cacheHome, "bpmn-modeler-vscode-smoke");
}

/**
 * Without a version, `@vscode/test-electron` picks the newest stable release
 * that satisfies the extension's `engines.vscode`.
 */
export async function downloadVsCode(
    extensionPath: string,
    version: string | undefined,
    log: (line: string) => void,
): Promise<string> {
    return downloadAndUnzipVSCode({
        ...(version ? { version } : {}),
        cachePath: vsCodeCachePath(),
        extensionDevelopmentPath: extensionPath,
        reporter: {
            report(report: ProgressReport) {
                if ("version" in report && String(report.stage) === "resolvedVersion") {
                    log(`VS Code ${report.version}`);
                }
            },
            error(error: unknown) {
                log(`VS Code download: ${String(error)}`);
            },
        },
    });
}

export interface VsCodeLaunchOptions {
    executablePath: string;
    extensionPath: string;
    extensionId: string;
    rootDirectory: string;
    workspaceDirectory: string;
    fileToOpen: string;
    customEditors: Readonly<Record<string, string>>;
    colorTheme: string;
    timeoutMs: number;
}

export class VsCodeSession {
    private constructor(
        readonly app: ElectronApplication,
        readonly page: Page,
        private readonly options: VsCodeLaunchOptions,
    ) {}

    static async launch(options: VsCodeLaunchOptions): Promise<VsCodeSession> {
        const userDataDirectory = join(options.rootDirectory, "user-data");
        const extensionsDirectory = join(options.rootDirectory, "extensions");
        await mkdir(join(userDataDirectory, "User"), { recursive: true });
        await mkdir(extensionsDirectory, { recursive: true });
        await writeUserSettings(options, options.colorTheme);

        const app = await electron.launch({
            executablePath: options.executablePath,
            args: [
                // https://github.com/microsoft/vscode/issues/84238
                "--no-sandbox",
                // https://github.com/microsoft/vscode-test/issues/221
                "--disable-gpu-sandbox",
                "--disable-updates",
                "--skip-welcome",
                "--skip-release-notes",
                "--disable-workspace-trust",
                "--disable-telemetry",
                "--disable-crash-reporter",
                "--no-cached-data",
                "--new-window",
                `--user-data-dir=${userDataDirectory}`,
                `--extensions-dir=${extensionsDirectory}`,
                `--extensionDevelopmentPath=${options.extensionPath}`,
                options.workspaceDirectory,
                options.fileToOpen,
            ],
            env: environmentWithoutParentVsCode(),
            timeout: options.timeoutMs,
        });
        try {
            const page = await app.firstWindow({ timeout: options.timeoutMs });
            page.setDefaultTimeout(options.timeoutMs);
            await page.waitForSelector(".monaco-workbench");
            await app.evaluate(({ BrowserWindow }, { width, height }) => {
                BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
            }, WINDOW_SIZE);
            return new VsCodeSession(app, page, options);
        } catch (error) {
            await closeApplication(app);
            throw error;
        }
    }

    get logsDirectory(): string {
        return join(this.options.rootDirectory, "user-data", "logs");
    }

    /**
     * The extension's visible webview document, inside VS Code's two webview
     * frames. Hidden editors keep their frames, so only the visible one counts.
     */
    webview(): FrameLocator {
        return this.page
            .locator(`iframe.webview[src*="extensionId=${this.options.extensionId}" i]`)
            .filter({ visible: true })
            .first()
            .contentFrame()
            .locator("iframe#active-frame")
            .contentFrame();
    }

    /**
     * Waits until `isRendered` holds for the webview. A file opened at start can
     * resolve before the development extension registered its custom editor and
     * then shows as text; it is reopened from the Explorer until the editor
     * association applies. Fails at once when the extension failed to activate,
     * because its editor is then never registered.
     */
    async showInCustomEditor(
        fileName: string,
        isRendered: (webview: FrameLocator) => Promise<boolean>,
    ): Promise<void> {
        const deadline = Date.now() + this.options.timeoutMs;
        let reopenedAt = 0;
        while (Date.now() < deadline) {
            if (await isRendered(this.webview()).catch(() => false)) return;
            const failures = await this.activationFailures();
            if (failures.length > 0) {
                throw new Error(`the extension failed to activate: ${failures.join("; ")}`);
            }
            const shownAsText = await this.page
                .locator(".editor-group-container.active .editor-instance .monaco-editor")
                .isVisible();
            if (shownAsText && Date.now() - reopenedAt > REOPEN_INTERVAL_MS) {
                reopenedAt = Date.now();
                await this.page.keyboard.press(`${COMMAND_KEY}+w`);
                await this.openFromExplorer(fileName);
            }
            await delay(200);
        }
        const frames = await this.page.locator("iframe.webview").count();
        throw new Error(
            `${fileName} never rendered in the custom editor (${frames} webview frames in the workbench)`,
        );
    }

    async openFromExplorer(fileName: string): Promise<void> {
        await this.page
            .locator(".explorer-folders-view")
            .getByText(fileName, { exact: true })
            .first()
            .click();
    }

    isActiveTabDirty(): Promise<boolean> {
        return this.page.locator(".tabs-container .tab.active.dirty").isVisible();
    }

    /** VS Code watches its settings file, so this switches the theme as a user's change does. */
    async setColorTheme(colorTheme: string): Promise<void> {
        await writeUserSettings(this.options, colorTheme);
    }

    workbenchHasClass(className: string): Promise<boolean> {
        return this.page
            .locator(".monaco-workbench")
            .evaluate((workbench, name) => workbench.classList.contains(name), className);
    }

    /** Reads `exthost.log` while the throwaway profile still exists. */
    async activationFailures(): Promise<string[]> {
        const files = await readdir(this.logsDirectory, { recursive: true }).catch(
            (): string[] => [],
        );
        const logs = await Promise.all(
            files
                .filter((file) => basename(file) === "exthost.log")
                .map((file) => readFile(join(this.logsDirectory, file), "utf8").catch(() => "")),
        );
        const headline = `activating extension ${this.options.extensionId} failed`;
        // VS Code logs the error itself on the line after the headline.
        return logs
            .map((log) => log.split(/\r?\n/))
            .flatMap((lines) =>
                lines.flatMap((line, index) =>
                    line.toLowerCase().includes(headline)
                        ? [`${line} ${lines[index + 1] ?? ""}`.trim()]
                        : [],
                ),
            );
    }

    /** CSS pixels, so a Retina Mac and a CI runner produce the same image size. */
    async screenshot(path: string): Promise<void> {
        await this.page.screenshot({ path, scale: "css" });
    }

    close(): Promise<void> {
        return closeApplication(this.app);
    }
}

async function writeUserSettings(options: VsCodeLaunchOptions, colorTheme: string): Promise<void> {
    const settings = {
        "workbench.colorTheme": colorTheme,
        "workbench.editorAssociations": options.customEditors,
        // Playwright types with the US layout; dispatching by `code` would read Ctrl+Z as Ctrl+Y on QWERTZ.
        "keyboard.dispatch": "keyCode",
        // An OS in dark or high-contrast mode must not override the theme under test.
        "window.autoDetectColorScheme": false,
        "window.autoDetectHighContrast": false,
        "window.restoreWindows": "none",
        "workbench.startupEditor": "none",
        "workbench.tips.enabled": false,
        "workbench.enableExperiments": false,
        "workbench.secondarySideBar.defaultVisibility": "hidden",
        "chat.disableAIFeatures": true,
        "telemetry.telemetryLevel": "off",
        "update.mode": "none",
        "extensions.autoCheckUpdates": false,
        "extensions.autoUpdate": false,
        "extensions.ignoreRecommendations": true,
        "security.workspace.trust.enabled": false,
        "git.enabled": false,
        // The saved text must be exactly what the modeler wrote.
        "files.autoSave": "off",
        "files.insertFinalNewline": false,
        "files.trimTrailingWhitespace": false,
        "files.trimFinalNewlines": false,
    };
    await writeFile(
        join(options.rootDirectory, "user-data", "User", "settings.json"),
        JSON.stringify(settings, null, 2),
    );
}

/**
 * Inside a VS Code terminal its `VSCODE_*` variables break the webview's service
 * worker, and `ELECTRON_RUN_AS_NODE` would start Electron as plain Node.
 */
function environmentWithoutParentVsCode(): Record<string, string> {
    return Object.fromEntries(
        Object.entries(process.env).filter(
            (entry): entry is [string, string] =>
                entry[1] !== undefined &&
                !/^VSCODE_/i.test(entry[0]) &&
                entry[0] !== "ELECTRON_RUN_AS_NODE",
        ),
    );
}

/** A modal dialog left by a failed step blocks a graceful quit. */
async function closeApplication(app: ElectronApplication): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closed = await Promise.race([
        app.close().then(
            () => true,
            () => true,
        ),
        new Promise<false>((done) => (timer = setTimeout(() => done(false), CLOSE_TIMEOUT_MS))),
    ]);
    clearTimeout(timer);
    if (!closed) app.process().kill("SIGKILL");
}
