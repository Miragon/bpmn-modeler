// Electron main entry for the standalone desktop app.
// Points Theia at the ./plugins directory bundled with the app and wires
// up auto-updates (only in packaged builds — disabled during dev).

const path = require("path");
const { existsSync } = require("fs");
const { app } = require("electron");

const isInsideAsar = __dirname.includes(".asar");
const bundledPluginsDir = isInsideAsar
    ? path.join(process.resourcesPath, "app", "plugins")
    : path.resolve(__dirname, "..", "plugins");

process.env.THEIA_DEFAULT_PLUGINS = `local-dir:${bundledPluginsDir}`;

if (app.isPackaged) {
    const { autoUpdater } = require("electron-updater");
    app.whenReady().then(() => {
        autoUpdater.checkForUpdatesAndNotify().catch((err) => {
            console.error("Auto-update check failed:", err);
        });
    });
}

const mainEntry = path.resolve(__dirname, "../lib/backend/electron-main.js");
if (!existsSync(mainEntry)) {
    console.error("ERROR: lib/backend/electron-main.js not found.");
    console.error(
        "Run `corepack yarn workspace standalone run rebuild && corepack yarn workspace standalone build` first.",
    );
    process.exit(1);
}

require(mainEntry);
