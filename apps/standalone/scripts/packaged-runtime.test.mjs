import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const asar = require("@electron/asar");
const appDir = fileURLToPath(new URL("../", import.meta.url));
const resources =
    process.env.STANDALONE_RESOURCES_DIR ?? path.join(appDir, "dist/linux-unpacked/resources");
const archive = path.join(resources, "app.asar");
const rg = `lib/backend/native/rg${process.platform === "win32" ? ".exe" : ""}`;

function extensionManifests(directory) {
    const manifest = path.join(directory, "package.json");
    if (existsSync(manifest)) {
        return [{ directory, manifest: JSON.parse(readFileSync(manifest, "utf8")) }];
    }
    return readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
        .flatMap((entry) => extensionManifests(path.join(directory, entry.name)));
}

for (const language of ["java", "javascript", "json", "markdown", "yaml"]) {
    test(`packaged plugins include the ${language} language and its grammar`, () => {
        const plugins = path.join(resources, "app/plugins");
        assert.ok(existsSync(plugins), `package the app before running this check: ${plugins}`);
        const extensions = extensionManifests(plugins);
        assert.ok(
            extensions.some(({ manifest }) =>
                manifest.contributes?.languages?.some(({ id }) => id === language),
            ),
            `${language} must be registered by a bundled extension`,
        );
        const grammars = extensions.flatMap(({ directory, manifest }) =>
            (manifest.contributes?.grammars ?? [])
                .filter((grammar) => grammar.language === language)
                .map((grammar) => path.join(directory, grammar.path)),
        );
        assert.ok(grammars.length > 0, `${language} must have a bundled grammar`);
        for (const grammar of grammars) {
            assert.ok(statSync(grammar).isFile(), `${grammar} must ship in the package`);
        }
    });
}

test("packaged file search can spawn its bundled ripgrep binary", (t) => {
    assert.ok(existsSync(archive), `package the app before running this check: ${archive}`);
    assert.equal(asar.statFile(archive, rg).unpacked, true, `${rg} must be unpacked from ASAR`);
    const binary = path.join(resources, "app.asar.unpacked", rg);
    assert.ok(statSync(binary).isFile());

    const workspace = mkdtempSync(path.join(tmpdir(), "modeler-packaged-ripgrep-"));
    t.after(() => rmSync(workspace, { recursive: true, force: true }));
    writeFileSync(path.join(workspace, "example.bpmn"), "fixture");
    const result = spawnSync(binary, ["--files", "--hidden", "--no-config"], {
        cwd: workspace,
        encoding: "utf8",
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /example\.bpmn/);
});
