import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
        let safeToRemove = true;
        try {
            if (app) {
                const child = app.process();
                const descendants = (pid) => {
                    let output;
                    try {
                        output = execFileSync("ps", ["-o", "pid=", "--ppid", String(pid)], {
                            encoding: "utf8",
                        });
                    } catch {
                        return [];
                    }
                    const children = output.trim().split(/\s+/).filter(Boolean).map(Number);
                    return [...children.flatMap(descendants), ...children];
                };
                const owned = descendants(child.pid);
                let timer;
                const closed = await Promise.race([
                    app.close().then(
                        () => true,
                        () => false,
                    ),
                    new Promise((resolve) => {
                        timer = setTimeout(() => resolve(false), 8000);
                    }),
                ]);
                clearTimeout(timer);
                if (!closed) {
                    const allOwned = [...new Set([...owned, ...descendants(child.pid)])];
                    const exited = new Promise((resolve) => child.once("exit", resolve));
                    for (const pid of [...allOwned, child.pid]) {
                        try {
                            process.kill(pid, "SIGKILL");
                        } catch {
                            // Already exited.
                        }
                    }
                    if (child.exitCode === null && child.signalCode === null) {
                        let exitTimer;
                        await Promise.race([
                            exited,
                            new Promise((resolve) => {
                                exitTimer = setTimeout(resolve, 3000);
                            }),
                        ]);
                        clearTimeout(exitTimer);
                        if (child.exitCode === null && child.signalCode === null) {
                            safeToRemove = false;
                            throw new Error(
                                "Electron did not exit after SIGKILL; keeping its profile for diagnosis",
                            );
                        }
                    }
                }
            }
        } finally {
            if (safeToRemove) rmSync(directory, { recursive: true, force: true });
        }
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
    await page.locator("#shell-tab-explorer-view-container").waitFor({ state: "visible" });
    const theme = page.getByPlaceholder("Choose your preferred Miragon theme");
    await theme.waitFor({ state: "visible", timeout: 20000 });
    await theme.press("Enter");
    await theme.waitFor({ state: "hidden" });
    await page.locator("#shell-tab-explorer-view-container").click();
    await page.getByText("search-fixture.bpmn", { exact: true }).waitFor({ timeout: 20000 });
    await page.keyboard.press("Control+p");
    await page.locator("input.input:visible").fill("search-fixture");
    await page.getByText("1 Results", { exact: true }).waitFor({ timeout: 15000 });
    assert.match(await page.locator("body").innerText(), /search-fixture\.bpmn[\s\S]*file results/);
    assert.doesNotMatch(errors.join(""), /file-search:FileSearchServiceImpl ERROR|spawn ENOTDIR/);
});
