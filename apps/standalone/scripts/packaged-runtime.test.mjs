import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../package.json", import.meta.url));
const asar = createRequire(require.resolve("app-builder-lib/package.json"))("@electron/asar");
const appDir = fileURLToPath(new URL("../", import.meta.url));
const resources =
    process.env.STANDALONE_RESOURCES_DIR ?? path.join(appDir, "dist/linux-unpacked/resources");
const archive = path.join(resources, "app.asar");
const rg = `lib/backend/native/rg${process.platform === "win32" ? ".exe" : ""}`;

test("packaged file search can spawn its bundled ripgrep binary", (t) => {
    assert.ok(existsSync(archive), `package the app before running this check: ${archive}`);
    assert.equal(asar.statFile(archive, rg).unpacked, true, `${rg} must be unpacked from ASAR`);
    const binary = path.join(resources, "app.asar.unpacked", rg);
    assert.ok(statSync(binary).isFile());

    const workspace = mkdtempSync(path.join(tmpdir(), "modeler-packaged-search-"));
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
