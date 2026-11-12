const path = require("path");
const { existsSync } = require("fs");

class StandaloneInstallation {
    static NSIS_UNINSTALLER = "Uninstall Miragon BPMN Modeler.exe";

    static of(app) {
        return new StandaloneInstallation({
            isPackaged: app.isPackaged,
            platform: process.platform,
            env: process.env,
            execPath: process.execPath,
        });
    }

    constructor({ isPackaged, platform, env, execPath, fileExists = existsSync }) {
        this.isPackaged = isPackaged;
        this.platform = platform;
        this.env = env;
        this.execPath = execPath;
        this.fileExists = fileExists;
    }

    get receivesUpdates() {
        if (!this.isPackaged || this.isFlatpak) return false;
        return this.platform !== "win32" || this.isNsisInstall;
    }

    get isFlatpak() {
        return Boolean(this.env.FLATPAK_ID);
    }

    // electron-updater on Windows installs the NSIS build, so a portable zip
    // (no uninstaller next to the executable) would get a second copy installed.
    get isNsisInstall() {
        const installDir = path.win32.dirname(this.execPath);
        return this.fileExists(path.win32.join(installDir, StandaloneInstallation.NSIS_UNINSTALLER));
    }
}

module.exports = { StandaloneInstallation };
