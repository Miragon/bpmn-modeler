import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkExternals, collectModuleSpecifiers } from "../scripts/check-externals.mjs";
import { checkInlinedPeers } from "../scripts/check-inlined-peers.mjs";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "bpmn-modeler-guard-"));
    temporaryDirectories.push(directory);
    return directory;
}

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true });
    }
});

describe("emitted external dependency guard", () => {
    it("parses imports without matching misleading comments or strings", () => {
        const source = `
            import main from "declared/subpath";
            import scoped from "@scope/declared/feature";
            export { value } from "declared/re-export";
            const lazy = import("declared/lazy");
            const commonJs = require("declared/commonjs");
            import fs from "node:fs";
            import promises from "fs/promises";
            // import ignored from "comment-only";
            const prose = 'require("string-only") and import("also-string-only")';
        `;

        expect(collectModuleSpecifiers(source)).toEqual([
            "declared/subpath",
            "@scope/declared/feature",
            "declared/re-export",
            "declared/lazy",
            "declared/commonjs",
            "node:fs",
            "fs/promises",
        ]);
    });

    it("accepts declared package subpaths and Node builtins", () => {
        const root = temporaryDirectory();
        const distDir = join(root, "dist");
        mkdirSync(join(distDir, "chunks"), { recursive: true });
        writeFileSync(
            join(distDir, "index.js"),
            'import "declared/subpath"; export * from "@scope/declared/feature";',
        );
        writeFileSync(
            join(distDir, "chunks", "lazy.js"),
            'import("declared/lazy"); require("fs/promises"); import "node:path";',
        );
        const manifestPath = join(root, "package.json");
        writeJson(manifestPath, {
            dependencies: { "declared": "1.0.0", "@scope/declared": "1.0.0" },
        });

        expect(checkExternals({ distDir, manifestPath })).toEqual({ checkedFiles: 2 });
    });

    it("rejects an undeclared dependency in a nested chunk", () => {
        const root = temporaryDirectory();
        const distDir = join(root, "dist");
        mkdirSync(join(distDir, "chunks", "nested"), { recursive: true });
        writeFileSync(join(distDir, "index.js"), 'import "declared";');
        writeFileSync(join(distDir, "chunks", "nested", "lazy.js"), 'import("missing/subpath");');
        const manifestPath = join(root, "package.json");
        writeJson(manifestPath, { dependencies: { declared: "1.0.0" } });

        expect(() => checkExternals({ distDir, manifestPath })).toThrow(
            /chunks[/\\]nested[/\\]lazy\.js: missing\/subpath \(missing\)/,
        );
    });

    it("does not accept dependencies declared only as peers or dev dependencies", () => {
        const root = temporaryDirectory();
        const distDir = join(root, "dist");
        mkdirSync(distDir);
        writeFileSync(join(distDir, "index.js"), 'import "peer-only"; import "dev-only/subpath";');
        const manifestPath = join(root, "package.json");
        writeJson(manifestPath, {
            peerDependencies: { "peer-only": "1.0.0" },
            devDependencies: { "dev-only": "1.0.0" },
        });

        expect(() => checkExternals({ distDir, manifestPath })).toThrow(/peer-only/);
        expect(() => checkExternals({ distDir, manifestPath })).toThrow(/dev-only\/subpath/);
    });

    it("rejects missing build output", () => {
        const root = temporaryDirectory();
        const manifestPath = join(root, "package.json");
        writeJson(manifestPath, { dependencies: {} });

        expect(() => checkExternals({ distDir: join(root, "dist"), manifestPath })).toThrow(
            /build output is missing/,
        );
    });
});

describe("inlined library peer guard", () => {
    it("rejects a peer absent from published runtime dependencies", () => {
        const packageRoot = temporaryDirectory();
        mkdirSync(join(packageRoot, "libs", "inline", "src"), { recursive: true });
        writeJson(join(packageRoot, "libs", "inline", "package.json"), {
            name: "@example/inline",
            peerDependencies: { "runtime-peer": "1.0.0" },
        });
        writeJson(join(packageRoot, "inlined-libraries.json"), [
            { name: "@example/inline", sourceRoot: "libs/inline/src" },
        ]);
        writeJson(join(packageRoot, "package.json"), {
            devDependencies: { "runtime-peer": "1.0.0" },
        });

        expect(() => checkInlinedPeers({ packageRoot })).toThrow(
            /@example\/inline requires runtime-peer/,
        );
    });

    it("accepts peers present in published runtime dependencies", () => {
        const packageRoot = temporaryDirectory();
        mkdirSync(join(packageRoot, "libs", "inline", "src"), { recursive: true });
        writeJson(join(packageRoot, "libs", "inline", "package.json"), {
            name: "@example/inline",
            peerDependencies: { "runtime-peer": "1.0.0" },
        });
        writeJson(join(packageRoot, "inlined-libraries.json"), [
            { name: "@example/inline", sourceRoot: "libs/inline/src" },
        ]);
        writeJson(join(packageRoot, "package.json"), {
            dependencies: { "runtime-peer": "2.0.0" },
        });

        expect(checkInlinedPeers({ packageRoot })).toEqual({ checkedLibraries: 1 });
    });
});
