import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const { ApplicationPackage } = createRequire(require.resolve("@theia/cli/package.json"))(
    "@theia/application-package",
);
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
