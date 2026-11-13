import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../../fitness/__fixtures__/tempGitRepository";
import { EngineSourceStructure } from "./engineSourceStructure";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
    const files: Record<string, string> = {
        "package.json": JSON.stringify({ name: "root", workspaces: ["apps/*", "libs/*"] }),
        "tsconfig.base.json": JSON.stringify({
            compilerOptions: { paths: { "@scope/core": ["./libs/core/src/index.ts"] } },
        }),
        "libs/core/package.json": JSON.stringify({ name: "@scope/core", types: "./src/index.ts" }),
        "libs/core/src/index.ts": 'export * from "./port/hostPorts";',
        "libs/core/src/port/hostPorts.ts": "export interface StatusBar {}",
        "apps/host/package.json": JSON.stringify({
            name: "host",
            private: true,
            main: "./dist/extension.js",
            scripts: { check: "node scripts/check.mjs" },
            contributes: { commands: [] },
            exports: { ".": "./src/extension.ts" },
        }),
        "apps/host/vite.config.mts": 'export default { input: "src/webview", outDir: "../../dist" };',
        "apps/host/src/extension.ts": 'import "./composition/wiring";\nexport function activate() {}',
        "apps/host/src/webview.ts": "export const webview = 1;",
        "apps/host/src/composition/wiring.ts": 'import "../adapter/out/StatusBar";\nexport const wired = true;',
        "apps/host/src/adapter/out/StatusBar.ts": [
            'import type { StatusBar } from "@scope/core";',
            'import schema from "../../targets.schema.json";',
            "export class HostStatusBar implements StatusBar {}",
        ].join("\n"),
        "apps/host/src/targets.schema.json": "{}",
        "apps/ide/src/main/kotlin/Editor.kt": "class Editor",
        "apps/host/src/StatusBar.spec.ts": 'import { StatusBar } from "./adapter/out/StatusBar";',
    };
    for (const [path, content] of Object.entries(files)) {
        repository.write(path, content);
    }
    repository.git("add", "--all");
    repository.git("commit", "--quiet", "-m", "fixture");
    repository.write("apps/host/src/untracked.ts", 'import { StatusBar } from "@scope/core";');
});

afterEach(() => {
    repository.remove();
});

describe("the engine source structure", () => {
    it("lists today's tracked files only", () => {
        const { files } = new EngineSourceStructure().read(repository.root);

        expect(files).toContain("apps/host/src/adapter/out/StatusBar.ts");
        expect(files).not.toContain("apps/host/src/untracked.ts");
    });

    it("links an alias import to the declaring file and a JSON import to the JSON file", () => {
        const { links } = new EngineSourceStructure().read(repository.root);

        expect(links.filter(({ from }) => from === "apps/host/src/adapter/out/StatusBar.ts")).toEqual([
            { from: "apps/host/src/adapter/out/StatusBar.ts", to: "apps/host/src/targets.schema.json" },
            { from: "apps/host/src/adapter/out/StatusBar.ts", to: "libs/core/src/port/hostPorts.ts" },
        ]);
        expect(links.some(({ from }) => from.endsWith(".spec.ts"))).toBe(false);
    });

    it("finds barrels from their content", () => {
        expect(new EngineSourceStructure().read(repository.root).barrels).toEqual([
            "libs/core/src/index.ts",
        ]);
    });

    it("reads each workspace's composition files, named entries and host contributions", () => {
        expect(new EngineSourceStructure().read(repository.root).workspaces).toEqual([
            {
                dir: "apps/host",
                compositionFiles: ["apps/host/src/composition/wiring.ts"],
                namedPaths: ["apps/host/src/extension.ts", "apps/host/src/webview.ts"],
                contributesToHost: true,
            },
            { dir: "apps/ide", compositionFiles: [], namedPaths: [], contributesToHost: false },
            {
                dir: "libs/core",
                compositionFiles: [],
                namedPaths: ["libs/core/src/index.ts"],
                contributesToHost: false,
            },
        ]);
    });

    it("lists the tracked files .gitattributes marks linguist-generated, set or true", () => {
        repository.write(
            ".gitattributes",
            [
                "apps/host/src/languages/** linguist-generated",
                "libs/core/src/generated.ts linguist-generated=true",
                "libs/core/src/port/** linguist-generated=false",
            ].join("\n"),
        );
        repository.write("apps/host/src/languages/de.ts", "export default {};");
        repository.write("libs/core/src/generated.ts", "export const generated = 1;");
        repository.git("add", "--all");
        repository.git("commit", "--quiet", "-m", "generated");
        repository.write("apps/host/src/languages/untracked.ts", "export default {};");

        expect(new EngineSourceStructure().read(repository.root).generatedFiles).toEqual([
            "apps/host/src/languages/de.ts",
            "libs/core/src/generated.ts",
        ]);
    });

    it("lists no generated file in a tree without .gitattributes", () => {
        expect(new EngineSourceStructure().read(repository.root).generatedFiles).toEqual([]);
    });

    it("reads a tree without path aliases", () => {
        repository.git("rm", "--quiet", "tsconfig.base.json");

        expect(new EngineSourceStructure().read(repository.root).links).not.toContainEqual({
            from: "apps/host/src/adapter/out/StatusBar.ts",
            to: "libs/core/src/port/hostPorts.ts",
        });
    });
});
