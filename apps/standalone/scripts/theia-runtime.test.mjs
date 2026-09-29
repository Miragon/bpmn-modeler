import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const app = require("./package.json");
const extensionManifest = require("../../libs/standalone-extension/package.json");
const { ApplicationPackage } = require("@theia/application-package");
const { satisfies } = require("semver");
const { parse } = require("yaml");
const application = new ApplicationPackage({
    projectPath: fileURLToPath(new URL("../", import.meta.url)),
});
const widgetModule = "@theia/core/lib/browser/widgets/widget";
const sharedWidget = require.resolve(widgetModule);

for (const extension of application.extensionPackages) {
    test(`${extension.name} shares the application's Theia widget runtime`, () => {
        const fromExtension = createRequire(extension.raw.installed.packagePath);
        assert.equal(
            fromExtension.resolve(widgetModule),
            sharedWidget,
            "Multiple Theia core instances decorate the same Lumino Widget and prevent startup",
        );
    });
}

test("Electron packaging uses the application's exact Theia-compatible runtime", () => {
    const electronVersion = app.devDependencies.electron;
    assert.equal(
        electronVersion,
        require("@theia/electron/package.json").peerDependencies.electron,
    );
    assert.equal(require("electron/package.json").version, electronVersion);
    const builderConfig = parse(
        readFileSync(new URL("../electron-builder.yml", import.meta.url), "utf8"),
    );
    assert.equal(
        builderConfig.electronVersion,
        undefined,
        "do not override the app's Electron pin",
    );
});

test("the standalone extension uses the host's React runtime and compatible types", () => {
    const fromExtension = createRequire(
        new URL("../../../libs/standalone-extension/package.json", import.meta.url),
    );
    for (const name of ["react", "react-dom"]) {
        assert.ok(satisfies(app.dependencies[name], extensionManifest.peerDependencies[name]));
        assert.ok(
            satisfies(
                app.dependencies[name],
                require("@theia/core/package.json").peerDependencies[name],
            ),
        );
        assert.equal(extensionManifest.devDependencies[name], app.dependencies[name]);
        assert.equal(fromExtension.resolve(name), require.resolve(name));
    }
    for (const name of ["@types/react", "@types/react-dom"]) {
        assert.ok(
            satisfies(
                app.devDependencies[name],
                require("@theia/core/package.json").peerDependencies[name],
            ),
        );
        assert.equal(extensionManifest.devDependencies[name], app.devDependencies[name]);
        assert.equal(
            fromExtension.resolve(`${name}/package.json`),
            require.resolve(`${name}/package.json`),
        );
    }
});

test("SCM and Timeline extensions are discovered by Theia", () => {
    const discovered = new Set(application.extensionPackages.map((extension) => extension.name));
    assert.ok(discovered.has("@theia/scm"));
    assert.ok(discovered.has("@theia/timeline"));
});
