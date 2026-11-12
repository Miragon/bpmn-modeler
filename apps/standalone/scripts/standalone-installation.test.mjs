import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(new URL("../package.json", import.meta.url));
const { StandaloneInstallation } = require("./scripts/standalone-installation.js");
const { parse } = require("yaml");
const builderConfig = parse(
    readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8"),
);

const installDir = "C:\\Users\\me\\AppData\\Local\\Programs\\Miragon BPMN Modeler";
const windowsInstall = {
    isPackaged: true,
    platform: "win32",
    env: {},
    execPath: `${installDir}\\Miragon BPMN Modeler.exe`,
};

test("Windows ships an installer and a portable zip", () => {
    assert.deepEqual(builderConfig.win.target, ["nsis", "zip"]);
});

test("the uninstaller name follows the NSIS naming of the product", () => {
    assert.equal(
        StandaloneInstallation.NSIS_UNINSTALLER,
        `Uninstall ${builderConfig.productName}.exe`,
    );
});

test("an installed Windows build receives updates", () => {
    const fileExists = (file) =>
        file === `${installDir}\\${StandaloneInstallation.NSIS_UNINSTALLER}`;
    const installation = new StandaloneInstallation({ ...windowsInstall, fileExists });
    assert.equal(installation.receivesUpdates, true);
});

test("a portable Windows build receives no updates", () => {
    const installation = new StandaloneInstallation({ ...windowsInstall, fileExists: () => false });
    assert.equal(installation.receivesUpdates, false);
});

test("a packaged macOS build receives updates", () => {
    const installation = new StandaloneInstallation({
        isPackaged: true,
        platform: "darwin",
        env: {},
        execPath: "/Applications/Miragon BPMN Modeler.app/Contents/MacOS/Miragon BPMN Modeler",
    });
    assert.equal(installation.receivesUpdates, true);
});

test("Flatpak and development builds receive no updates", () => {
    const linux = {
        platform: "linux",
        execPath: "/app/main/miragon-bpmn-modeler",
        fileExists: () => true,
    };
    const flatpak = new StandaloneInstallation({
        ...linux,
        isPackaged: true,
        env: { FLATPAK_ID: "io.miragon.BpmnModeler" },
    });
    const development = new StandaloneInstallation({ ...linux, isPackaged: false, env: {} });
    assert.equal(flatpak.receivesUpdates, false);
    assert.equal(development.receivesUpdates, false);
});
