import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkDts } from "../scripts/check-dts.mjs";
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

describe("declaration roll-up guard", () => {
    function dtsFixture(indexDts: string): { distDir: string; configPath: string } {
        const root = temporaryDirectory();
        const distDir = join(root, "dist");
        mkdirSync(distDir);
        writeFileSync(join(distDir, "index.d.ts"), indexDts);
        const configPath = join(root, "inlined-libraries.json");
        writeJson(configPath, [
            { name: "@miragon/bpmn-modeler-layout", sourceRoot: "libs/bpmn-layout/src" },
        ]);
        return { distDir, configPath };
    }

    it("checks every inlined library named in the build config", () => {
        const { distDir, configPath } = dtsFixture("export declare const value: number;\n");

        expect(checkDts({ distDir, configPath, entries: ["index.d.ts"] })).toEqual({
            checkedEntries: 1,
            privateLibs: 1,
        });
    });

    it("rejects a config-listed lib import the hand-kept list used to miss", () => {
        const { distDir, configPath } = dtsFixture(
            'import { layout } from "@miragon/bpmn-modeler-layout";\n' +
                "export declare function format(): ReturnType<typeof layout>;\n",
        );

        expect(() => checkDts({ distDir, configPath, entries: ["index.d.ts"] })).toThrow(
            /leaked private-lib import: @miragon\/bpmn-modeler-layout/,
        );
    });

    it("rejects a leaked protocol symbol", () => {
        const { distDir, configPath } = dtsFixture("export declare const api: HostApi;\n");

        expect(() => checkDts({ distDir, configPath, entries: ["index.d.ts"] })).toThrow(
            /leaked protocol symbols: HostApi/,
        );
    });

    it("rejects an ambient declaration that carries a body", () => {
        const { distDir, configPath } = dtsFixture("declare function leaked(): void { return; }\n");

        expect(() => checkDts({ distDir, configPath, entries: ["index.d.ts"] })).toThrow(
            /invalid ambient declaration/,
        );
    });

    it("ignores backtick-quoted prose mentions of a private lib", () => {
        const { distDir, configPath } = dtsFixture(
            "/** Inlined from `@miragon/bpmn-modeler-layout`. */\n" +
                "export declare const value: number;\n",
        );

        expect(() => checkDts({ distDir, configPath, entries: ["index.d.ts"] })).not.toThrow();
    });

    it("rejects a missing build output", () => {
        const { configPath } = dtsFixture("export {};\n");

        expect(() =>
            checkDts({
                distDir: join(temporaryDirectory(), "dist"),
                configPath,
                entries: ["index.d.ts"],
            }),
        ).toThrow(/not found — run the lib build first/);
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

    it("rejects a lib runtime dependency absent from published runtime dependencies", () => {
        const packageRoot = temporaryDirectory();
        mkdirSync(join(packageRoot, "libs", "inline", "src"), { recursive: true });
        writeJson(join(packageRoot, "libs", "inline", "package.json"), {
            name: "@example/inline",
            dependencies: { "runtime-dep": "1.0.0" },
        });
        writeJson(join(packageRoot, "inlined-libraries.json"), [
            { name: "@example/inline", sourceRoot: "libs/inline/src" },
        ]);
        writeJson(join(packageRoot, "package.json"), {
            devDependencies: { "runtime-dep": "1.0.0" },
        });

        expect(() => checkInlinedPeers({ packageRoot })).toThrow(
            /runtime dependencies must be published runtime dependencies or themselves inlined libraries:\n {2}- @example\/inline depends on runtime-dep/,
        );
    });

    it("accepts a lib depending on another inlined library", () => {
        const packageRoot = temporaryDirectory();
        mkdirSync(join(packageRoot, "libs", "inline", "src"), { recursive: true });
        mkdirSync(join(packageRoot, "libs", "other", "src"), { recursive: true });
        writeJson(join(packageRoot, "libs", "inline", "package.json"), {
            name: "@example/inline",
            dependencies: { "@example/other": "workspace:*", "published-dep": "1.0.0" },
        });
        writeJson(join(packageRoot, "libs", "other", "package.json"), {
            name: "@example/other",
        });
        writeJson(join(packageRoot, "inlined-libraries.json"), [
            { name: "@example/inline", sourceRoot: "libs/inline/src" },
            { name: "@example/other", sourceRoot: "libs/other/src" },
        ]);
        writeJson(join(packageRoot, "package.json"), {
            dependencies: { "published-dep": "1.0.0" },
        });

        expect(checkInlinedPeers({ packageRoot })).toEqual({ checkedLibraries: 2 });
    });
});
