import { execFile } from "node:child_process";
import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { downloadAndUnzipVSCode, type ProgressReport } from "@vscode/test-electron";
import {
    _electron as electron,
    type ElectronApplication,
    type FrameLocator,
    type Locator,
    type Page,
} from "playwright-core";

const runFile = promisify(execFile);
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export const COMMAND_KEY = process.platform === "darwin" ? "Meta" : "Control";
const PALETTE_ATTEMPT_MS = 5_000;
const PALETTE_ATTEMPTS = 6;
// A menu item listens for the mouse only 100 ms after it renders; a quicker click is lost.
const MENU_MOUSE_DELAY_MS = 150;

const WINDOW_SIZE = { width: 1280, height: 800 };
const REOPEN_INTERVAL_MS = 2_000;
const CLOSE_TIMEOUT_MS = 10_000;
const EXPLORER_SCROLLS = 20;

/** Bypass Codium's Node CLI shim so Playwright attaches to the actual Electron process. */
export async function flatpakVSCodium(rootDirectory: string): Promise<string> {
    const launcher = join(rootDirectory, "flatpak-codium");
    const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
    await writeFile(
        launcher,
        `#!/bin/sh\nexec flatpak run ${quote(`--filesystem=${rootDirectory}`)} --command=/app/bin/com.vscodium.codium-wrapper com.vscodium.codium "$@"\n`,
    );
    await chmod(launcher, 0o700);
    return launcher;
}

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
    private readonly reportedCspViolations: string[] = [];

    private constructor(
        readonly app: ElectronApplication,
        readonly page: Page,
        private readonly options: VsCodeLaunchOptions,
    ) {
        // Chromium reports each violation as a console message of the webview frame
        // that caused it; the context sees them all, including those raised at load.
        page.context().on("console", (message) => {
            if (message.text().includes("Content Security Policy")) {
                this.reportedCspViolations.push(`${message.location().url}: ${message.text()}`);
            }
        });
    }

    get cspViolations(): readonly string[] {
        return this.reportedCspViolations;
    }

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
     * The extension's visible editor webview document, inside VS Code's two
     * webview frames. Hidden editors keep their frames, so only the visible one
     * counts; a side bar view beside it is not an editor.
     */
    webview(): FrameLocator {
        return pageOf(this.editorFrames().filter({ visible: true }).first());
    }

    /** The outer frames of every editor webview, visible or not. */
    editorFrames(): Locator {
        return this.page.locator(
            `iframe.webview[src*="extensionId=${this.options.extensionId}" i]:not([src*="purpose=webviewView"])`,
        );
    }

    /**
     * The extension's visible side bar view whose page holds `shows`. The
     * frames carry no view id, and the Deploy view's page may be loaded too.
     */
    async viewWebview(shows: string): Promise<FrameLocator> {
        const frames = this.page.locator(
            `iframe.webview[src*="extensionId=${this.options.extensionId}" i][src*="purpose=webviewView"]`,
        );
        return this.firstShowing(frames, shows, "view");
    }

    /** Closes the editor tab whose title matches, by its own close button, whichever editor is active. */
    async closeEditorTab(title: RegExp): Promise<void> {
        const tab = this.page.locator(".tabs-container .tab").filter({ hasText: title }).first();
        await tab.click();
        const close = tab.getByRole("button", { name: /^Close/ });
        if (await close.count()) await close.first().click();
        else await this.page.keyboard.press(`${COMMAND_KEY}+w`);
        await tab.waitFor({ state: "detached", timeout: this.options.timeoutMs });
    }

    /** The extension's visible editor webview whose page holds `shows`, such as one side of a diff. */
    editorWebview(shows: string): Promise<FrameLocator> {
        return this.firstShowing(this.editorFrames(), shows, "editor");
    }

    private async firstShowing(
        frames: Locator,
        shows: string,
        kind: string,
    ): Promise<FrameLocator> {
        const visible = frames.filter({ visible: true });
        const deadline = Date.now() + this.options.timeoutMs;
        while (Date.now() < deadline) {
            const count = await visible.count();
            for (let index = 0; index < count; index++) {
                const page = pageOf(visible.nth(index));
                const matches = await page
                    .locator(shows)
                    .count()
                    .catch(() => 0);
                if (matches > 0) return page;
            }
            await delay(200);
        }
        throw new Error(`no visible ${kind} of the extension shows ${shows}`);
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
        // Leave any hovered label before dismissing transient workbench UI.
        await this.page.mouse.move(0, 0);
        await this.page.keyboard.press("Escape");
        await (await this.explorerRow(fileName)).click();
        await this.movePointerAway();
    }

    /** A double click keeps the tab, where a single click opens one the next file replaces. */
    async keepOpenFromExplorer(fileName: string): Promise<void> {
        await (await this.explorerRow(fileName)).dblclick();
        await this.movePointerAway();
    }

    /**
     * The Explorer renders only the rows in sight, and after the Add-ons view
     * was shown in its place it shows the tree from the top, so a row further
     * down is scrolled to first.
     */
    private async explorerRow(fileName: string): Promise<Locator> {
        const tree = this.page.locator(".explorer-folders-view");
        const row = tree.getByText(fileName, { exact: true }).first();
        if ((await tree.isVisible()) && !(await row.isVisible())) {
            await tree.hover();
            await this.page.mouse.wheel(0, -100_000);
            for (
                let scrolls = 0;
                scrolls < EXPLORER_SCROLLS && !(await row.isVisible());
                scrolls++
            ) {
                await this.page.mouse.wheel(0, 200);
                await delay(100);
            }
        }
        return row;
    }

    /** A pointer left on a row shows its hover, which can cover what a later step clicks. */
    private async movePointerAway(): Promise<void> {
        await this.page.mouse.move(0, 0);
    }

    /**
     * Webviews forward keybindings, so F1 reaches the palette without moving the focus first.
     * A webview that was just opened can still take the focus, which closes the palette at any
     * point and sends keys into the webview, an Enter included. So the title goes into the
     * palette's input and a click on the row runs the command, which fails on a palette that
     * closed; that one starts over.
     */
    async runCommand(title: string): Promise<void> {
        const palette = this.page.locator(".quick-input-widget");
        const input = palette.locator(".quick-input-box input");
        // The best match; until the list has filtered, that row holds another command.
        const row = palette.locator(".monaco-list-row.focused").filter({ hasText: title });
        for (let attempt = 1; ; attempt++) {
            await this.page.keyboard.press("F1");
            try {
                await input.fill(`>${title}`, { timeout: PALETTE_ATTEMPT_MS });
                await row.click({ timeout: PALETTE_ATTEMPT_MS });
                await this.movePointerAway();
                return;
            } catch (error) {
                if (attempt === PALETTE_ATTEMPTS) {
                    throw error;
                }
            }
        }
    }

    /**
     * Selects the Explorer rows in order, as a user does with Ctrl or Cmd, and runs
     * `command` from their context menu. A webview that takes the focus closes the menu,
     * as it closes the palette, so a closed menu is opened again.
     */
    async runExplorerCommand(fileNames: readonly string[], command: string): Promise<void> {
        const item = this.page.locator(".context-view").getByText(command, { exact: true });
        for (let attempt = 1; ; attempt++) {
            await this.page.mouse.move(0, 0);
            await this.page.keyboard.press("Escape");
            for (const [index, fileName] of fileNames.entries()) {
                await (
                    await this.explorerRow(fileName)
                ).click({ modifiers: index === 0 ? [] : ["ControlOrMeta"] });
            }
            await (
                await this.explorerRow(fileNames[fileNames.length - 1])
            ).click({ button: "right" });
            try {
                await item.waitFor({ timeout: PALETTE_ATTEMPT_MS });
                await delay(MENU_MOUSE_DELAY_MS);
                await item.click({ timeout: PALETTE_ATTEMPT_MS });
                await this.movePointerAway();
                return;
            } catch (error) {
                if (attempt === PALETTE_ATTEMPTS) {
                    throw error;
                }
            }
        }
    }

    clipboardText(): Promise<string> {
        return this.app.evaluate(({ clipboard }) => clipboard.readText());
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

    /** What the extension wrote to its output channel, which VS Code keeps as a log file. */
    async extensionLog(): Promise<string> {
        const files = await readdir(this.logsDirectory, { recursive: true }).catch(
            (): string[] => [],
        );
        const logs = await Promise.all(
            files
                .filter(
                    (file) =>
                        file.endsWith(".log") &&
                        file.split(/[\\/]/).includes(this.options.extensionId),
                )
                .map((file) => readFile(join(this.logsDirectory, file), "utf8").catch(() => "")),
        );
        return logs.join("\n");
    }

    /** CSS pixels, so a Retina Mac and a CI runner produce the same image size. */
    async screenshot(path: string): Promise<void> {
        await this.page.screenshot({ path, scale: "css" });
    }

    close(): Promise<"quit" | "killed"> {
        return closeApplication(this.app);
    }
}

/** The extension's own document inside one of VS Code's outer webview frames. */
function pageOf(outerFrame: Locator): FrameLocator {
    return outerFrame.contentFrame().locator("iframe#active-frame").contentFrame();
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
        // Context menus in the DOM, where a test can click them; macOS draws native ones.
        "window.menuStyle": "custom",
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

/**
 * A modal dialog left by a failed step blocks a graceful quit. A killed VS Code
 * may not have flushed its global state, so the caller learns which it was.
 */
async function closeApplication(app: ElectronApplication): Promise<"quit" | "killed"> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closed = await Promise.race([
        app.close().then(
            () => true,
            () => true,
        ),
        new Promise<false>((done) => (timer = setTimeout(() => done(false), CLOSE_TIMEOUT_MS))),
    ]);
    clearTimeout(timer);
    if (closed) return "quit";
    app.process().kill("SIGKILL");
    return "killed";
}
