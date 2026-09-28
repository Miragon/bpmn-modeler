import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { ripgrepAsarPlugin } from "./ripgrep-asar-plugin.mjs";

test("bundled ripgrep resolves beside ASAR on Linux, Windows, and unpackaged builds", () => {
    let load;
    ripgrepAsarPlugin.setup({
        onLoad({ filter }, handler) {
            assert.ok(filter.test("/node_modules/@vscode/ripgrep/lib/index.js"));
            load = handler;
        },
    });
    const generated = load().contents.replace(/^export const rgPath = /, "return ");
    const resolve = (directory, platform, paths) =>
        new Function("require", "__dirname", "process", generated)(() => paths, directory, {
            platform,
        });

    assert.equal(
        resolve("/app/resources/app.asar/lib/backend", "linux", path.posix),
        "/app/resources/app.asar.unpacked/lib/backend/native/rg",
    );
    assert.equal(
        resolve("C:\\App\\resources\\app.asar\\lib\\backend", "win32", path.win32),
        "C:\\App\\resources\\app.asar.unpacked\\lib\\backend\\native\\rg.exe",
    );
    assert.equal(
        resolve("/repo/apps/standalone/lib/backend", "linux", path.posix),
        "/repo/apps/standalone/lib/backend/native/rg",
    );
});
