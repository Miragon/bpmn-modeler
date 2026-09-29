import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../../package.json", import.meta.url));
const { _electron } = require("playwright");
const appDir = fileURLToPath(new URL("../", import.meta.url));
const binary =
    process.env.STANDALONE_PACKAGED_BINARY ??
    path.join(appDir, "dist/linux-unpacked/miragon-bpmn-modeler");

test("packaged Quick Open finds files through Theia's ripgrep backend", async (t) => {
    const directory = mkdtempSync(path.join(tmpdir(), "modeler-packaged-quick-open-"));
    let app;
    t.after(async () => {
        if (app) {
            const child = app.process();
            if (child.exitCode === null && child.signalCode === null) {
                const exited = new Promise((resolve) => child.once("exit", resolve));
                // Theia's Electron quit handler terminates its separately forked backend.
                const quit = app.evaluate(({ app: electronApp }) => {
                    setTimeout(() => electronApp.exit(0), 0);
                });
                let timer;
                try {
                    await Promise.race([
                        quit.then(() => exited),
                        new Promise((_, reject) => {
                            timer = setTimeout(
                                () => reject(new Error("Electron exit timed out")),
                                8000,
                            );
                        }),
                    ]);
                } finally {
                    clearTimeout(timer);
                }
            }
        }
        rmSync(directory, { recursive: true, force: true });
    });
    const workspace = path.join(directory, "workspace");
    const home = path.join(directory, "home");
    mkdirSync(workspace);
    mkdirSync(home);
    writeFileSync(path.join(workspace, "search-fixture.bpmn"), "fixture");

    const env = {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, "config"),
        XDG_DATA_HOME: path.join(home, "data"),
        XDG_CACHE_HOME: path.join(home, "cache"),
    };
    delete env.FLATPAK_ID;
    app = await _electron.launch({
        executablePath: binary,
        args: [
            "--ozone-platform=x11",
            "--no-sandbox",
            `--user-data-dir=${path.join(home, "profile")}`,
            workspace,
        ],
        env,
        timeout: 30000,
    });
    const errors = [];
    app.process().stderr?.on("data", (chunk) => errors.push(String(chunk)));
    await app.firstWindow();
    let page;
    for (let attempt = 0; attempt < 50 && !page; attempt++) {
        page = app.windows().find((window) => window.url().includes("/lib/frontend/index.html"));
        if (!page) await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(page, "Theia workbench did not open");
    // The isolated profile can suppress onboarding without a product-only flag.
    await page.evaluate(() => localStorage.setItem("miragon.firstRunCompleted", "1"));
    await page.reload();
    await page.locator("#shell-tab-explorer-view-container").waitFor({ state: "visible" });
    await page.locator("#shell-tab-explorer-view-container").click();
    // Never open the fixture: Quick Open must ask file-search, not recent files.
    await page.keyboard.press("Control+p");
    const quickOpen = page.locator(".quick-input-widget:visible");
    await quickOpen.locator("input").fill("search-fixture");
    await quickOpen
        .locator(".quick-input-list .monaco-list-row")
        .getByText("search-fixture.bpmn", { exact: true })
        .waitFor({ timeout: 15000 });
    assert.doesNotMatch(errors.join(""), /file-search:FileSearchServiceImpl ERROR|spawn ENOTDIR/);
});
