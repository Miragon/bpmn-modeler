import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildImportGraph } from "./importGraph";
import { impureDomainImports, modulePurity, readModulePurity } from "./modulePurity";
import type { ModulePurity, WorkspaceSources } from "./modulePurity";
import type { PathAlias } from "./pathAliases";
import type { Workspace } from "./workspaces";

interface WorkspaceShape {
    readonly name: string;
    readonly kind?: string;
    /** Whether its compiler program loads the DOM lib; unset reads as DOM-free. */
    readonly withDom?: boolean;
    /** Source text by path relative to the workspace's `src/`. */
    readonly files: Readonly<Record<string, string>>;
}

/** Each workspace sits in `libs/<last part of its name>` and is aliased by name to its `src/index.ts`. */
function sourcesOf(shapes: readonly WorkspaceShape[]): WorkspaceSources[] {
    return shapes.map(({ name, kind, files }) => ({
        name,
        dir: dirOf(name),
        ...(kind === undefined ? {} : { kind }),
        graph: buildImportGraph(Object.entries(files).map(([path, text]) => ({ path, text }))),
    }));
}

function compilesWithDomOf(shapes: readonly WorkspaceShape[]) {
    return ({ name }: Workspace): boolean =>
        shapes.find((shape) => shape.name === name)?.withDom === true;
}

function dirOf(name: string): string {
    return `libs/${name.split("/").pop()}`;
}

function aliasesOf(shapes: readonly WorkspaceShape[]): PathAlias[] {
    return shapes.flatMap(({ name }) => [
        { pattern: name, targets: [`${dirOf(name)}/src/index.ts`] },
        { pattern: `${name}/*`, targets: [`${dirOf(name)}/src/*`] },
    ]);
}

function purityOf(shapes: readonly WorkspaceShape[]): ModulePurity {
    return modulePurity(sourcesOf(shapes), aliasesOf(shapes), compilesWithDomOf(shapes));
}

/** The workspaces whose entry a `domain/` file may import. */
function pureEntries(shapes: readonly WorkspaceShape[]): string[] {
    const isPureModule = purityOf(shapes);
    return shapes.map(({ name }) => name).filter(isPureModule);
}

function lib(
    name: string,
    files: Readonly<Record<string, string>>,
    withDom = false,
): WorkspaceShape {
    return { name, withDom, files };
}

function hexagonal(name: string, files: Readonly<Record<string, string>>): WorkspaceShape {
    return { name, kind: "hexagonal", files };
}

describe("modulePurity", () => {
    it("reads a module that reaches no platform module, in a workspace whose program loads no DOM, as pure", () => {
        expect(pureEntries([lib("@x/diff", { "index.ts": 'export const diff = "";' })])).toEqual([
            "@x/diff",
        ]);
    });

    it("follows imports to the file, so a DOM-free entry of a workspace with DOM chrome keeps its importer pure", () => {
        const types = lib(
            "@x/types",
            {
                "index.ts": 'export * from "./engine";\nexport * from "./canvas";',
                "engine.ts": 'export type Engine = "c7" | "c8";',
                "canvas.ts": "export const fit = () => document.body;",
            },
            true,
        );
        const merge = lib("@x/merge", {
            "index.ts": 'import type { Engine } from "@x/types/engine";\nimport "./build";',
            "build.ts": 'import { diff } from "@x/diff";',
        });
        const diff = lib("@x/diff", { "index.ts": "export const diff = 1;" });

        expect(pureEntries([types, merge, diff])).toEqual(["@x/merge", "@x/diff"]);
    });

    it("reads a DOM-free module of a workspace whose program loads the DOM as impure, as the module has no compile of its own", () => {
        const types = lib(
            "@x/types",
            { "engine.ts": 'export type Engine = "c7";', "canvas.ts": "export {};" },
            true,
        );

        expect(purityOf([types])("@x/types/engine")).toBe(false);
    });

    it("reads a workspace whose program loads the DOM as impure, whatever it imports", () => {
        expect(pureEntries([lib("@x/shared", { "index.ts": "export {};" }, true)])).toEqual([]);
    });

    it("asks the compiler only about a module that reaches only pure code, once per workspace", () => {
        const shapes = [
            lib("@x/diff", { "index.ts": "export {};", "rules.ts": "export {};" }),
            lib("@x/reader", { "index.ts": 'import "node:fs";' }),
            hexagonal("@x/core", {
                "index.ts": 'export * from "./stage/service/run";',
                "stage/service/run.ts": "export {};",
            }),
        ];
        const asked: string[] = [];
        const isPureModule = modulePurity(sourcesOf(shapes), aliasesOf(shapes), ({ name }) => {
            asked.push(name);
            return false;
        });

        ["@x/diff", "@x/diff/rules", "@x/reader", "@x/core", "@x/diff"].forEach(isPureModule);

        expect(asked).toEqual(["@x/diff"]);
    });

    it.each(["hexagonal", "diagram-js", "flat", undefined])(
        "decides without the kind: a DOM-free workspace of kind %s that reaches only pure code is pure",
        (kind) => {
            const shape: WorkspaceShape = {
                name: "@x/core",
                files: { "index.ts": "export {};" },
                ...(kind === undefined ? {} : { kind }),
            };

            expect(pureEntries([shape])).toEqual(["@x/core"]);
        },
    );

    it("reads a hexagonal workspace whose entry re-exports only its domain/ as pure, whatever its service/ imports", () => {
        const merge = hexagonal("@x/merge", {
            "index.ts": 'export * from "./stage/domain/rules";',
            "stage/domain/rules.ts": 'export * from "./picks";',
            "stage/domain/picks.ts": "export const picks = [];",
            "stage/service/build.ts":
                'import { readFileSync } from "node:fs";\nimport "../domain/rules";',
        });

        expect(pureEntries([merge])).toEqual(["@x/merge"]);
    });

    it("reads a hexagonal workspace whose entry reaches its service/ as impure, and its domain/ as pure", () => {
        const merge = hexagonal("@x/merge", {
            "index.ts":
                'export * from "./stage/domain/rules";\nexport * from "./stage/service/build";',
            "stage/domain/rules.ts": "export const rules = [];",
            "stage/service/build.ts": 'import "../domain/rules";',
        });
        const isPureModule = purityOf([merge]);

        expect({
            entry: isPureModule("@x/merge"),
            domain: isPureModule("@x/merge/stage/domain/rules"),
        }).toEqual({ entry: false, domain: true });
    });

    it.each(["port", "service", "adapter/in", "adapter/out", "composition"])(
        "reads a module that reaches a file in %s/ of any workspace as impure, one that reaches its domain/ not",
        (folder) => {
            const core = hexagonal("@x/core", {
                "domain/errors.ts": "export {};",
                [`${folder}/store.ts`]: "export {};",
            });
            const rules = lib("@x/rules", { "index.ts": 'import "@x/core/domain/errors";' });
            const view = lib("@x/view", {
                "index.ts": 'import "./panel";',
                "panel.ts": `import "@x/core/${folder}/store";`,
            });

            expect(pureEntries([core, rules, view])).toEqual(["@x/rules"]);
        },
    );

    it("reads a module that reaches a role folder through a relative import as impure", () => {
        const view = lib("@x/view", {
            "index.ts": 'import "./ui/adapter/in/panel";',
            "ui/adapter/in/panel.ts": "export {};",
        });

        expect(pureEntries([view])).toEqual([]);
    });

    it("reads a module that reaches node:fs through another workspace as impure, and that one too", () => {
        const reader = lib("@x/reader", {
            "index.ts": 'import "./files";',
            "files.ts": 'import { readFileSync } from "node:fs";',
        });
        const rules = lib("@x/rules", { "index.ts": 'export * from "@x/reader";' });

        expect(pureEntries([reader, rules])).toEqual([]);
    });

    it.each([
        "node:fs",
        "fs/promises",
        "path",
        "child_process",
        "vscode",
        "electron",
        "electron/main",
    ])("reads an import of %s as a platform module", (specifier) => {
        expect(pureEntries([lib("@x/lib", { "index.ts": `import "${specifier}";` })])).toEqual([]);
    });

    it("reads a package outside the repo as a leaf it does not follow", () => {
        expect(pureEntries([lib("@x/diff", { "index.ts": 'import "bpmn-moddle";' })])).toEqual([
            "@x/diff",
        ]);
    });

    it.each([
        ["a package outside the repo", "lodash"],
        ["a platform module", "path"],
        ["a workspace whose name extends a pure one", "@x/merge-tools"],
        ["a module of a pure workspace that resolves to no file", "@x/merge/missing"],
    ])("reads %s as no pure module", (_name, specifier) => {
        expect(purityOf([lib("@x/merge", { "index.ts": "export {};" })])(specifier)).toBe(false);
    });

    it("reads a workspace import that resolves to no file as impure, as it cannot be followed", () => {
        const merge = lib("@x/merge", { "index.ts": 'import "@x/diff/missing";' });
        const diff = lib("@x/diff", { "index.ts": "export {};" });

        expect(pureEntries([merge, diff])).toEqual(["@x/diff"]);
    });

    it("ends on an import cycle between workspaces", () => {
        const left = lib("@x/left", { "index.ts": 'import "@x/right";' });
        const right = lib("@x/right", { "index.ts": 'import "@x/left";' });

        expect(pureEntries([left, right])).toEqual(["@x/left", "@x/right"]);
    });
});

describe("impureDomainImports", () => {
    const isPureModule: ModulePurity = (specifier) =>
        specifier === "@x/merge" || specifier.startsWith("@x/merge/");

    function offendersOf(path: string, text: string): string[] {
        return impureDomainImports(buildImportGraph([{ path, text }]), isPureModule).map(
            ({ from, specifier }) => `${from} -> ${specifier}`,
        );
    }

    it.each([
        ["a value import", 'import { MERGE_SIDES } from "@x/merge";'],
        ["a type import", 'import type { MergeRefusal } from "@x/merge";'],
        ["a subpath", 'import { closePicks } from "@x/merge/closure";'],
        ["a relative import", 'import { x } from "./rules";'],
    ])("allows %s of a pure module or the tree", (_name, text) => {
        expect(offendersOf("diff/domain/x.ts", text)).toEqual([]);
    });

    it.each([
        [
            "an impure module, even type-only",
            'import type { Query } from "@x/shared";',
            "@x/shared",
        ],
        ["a package outside the repo", 'import debounce from "lodash";', "lodash"],
        ["a platform module", 'import { posix } from "path";', "path"],
    ])("refuses %s", (_name, text, specifier) => {
        expect(offendersOf("diff/domain/x.ts", text)).toEqual([`diff/domain/x.ts -> ${specifier}`]);
    });

    it("reads only domain/ files", () => {
        expect(offendersOf("diff/service/x.ts", 'import "@x/shared";')).toEqual([]);
    });
});

describe("readModulePurity", () => {
    let root: string;

    const write = (path: string, content: object | string): void => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(
            join(root, path),
            typeof content === "string" ? content : JSON.stringify(content),
        );
    };

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "module-purity-"));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("reads the manifests, the compiler programs, the sources and the path aliases of the repo, not the kinds", () => {
        write("package.json", { workspaces: ["libs/*", "docs"] });
        write("tsconfig.base.json", {
            compilerOptions: {
                lib: ["ES2021", "DOM"],
                paths: {
                    "@x/diff": ["./libs/diff/src/index.ts"],
                    "@x/merge": ["./libs/merge/src/index.ts"],
                    "@x/shared": ["./libs/shared/src/index.ts"],
                    "@x/view": ["./libs/view/src/index.ts"],
                },
            },
        });
        write("libs/diff/package.json", { name: "@x/diff", architecture: "flat" });
        write("libs/diff/tsconfig.json", {
            extends: "../../tsconfig.base.json",
            compilerOptions: { lib: ["ESNext"] },
        });
        write("libs/diff/src/index.ts", "export const diff = 1;");
        write("libs/merge/package.json", { name: "@x/merge", architecture: "hexagonal" });
        write("libs/merge/tsconfig.json", {
            extends: "../../tsconfig.base.json",
            compilerOptions: { lib: ["ES2021"] },
        });
        write("libs/merge/src/index.ts", 'export * from "./stage/domain/merge";');
        write("libs/merge/src/stage/domain/merge.ts", 'export { diff } from "@x/diff";');
        write("libs/shared/package.json", { name: "@x/shared", architecture: "flat" });
        write("libs/shared/tsconfig.json", { extends: "../../tsconfig.base.json" });
        write("libs/shared/src/index.ts", "export {};");
        write("libs/view/package.json", { name: "@x/view", architecture: "flat" });
        write("libs/view/tsconfig.json", {
            extends: "../../tsconfig.base.json",
            compilerOptions: { lib: ["ES2021"] },
        });
        write("libs/view/src/index.ts", 'export type { Props } from "./jsx";');
        write("libs/view/src/jsx.d.ts", '/// <reference lib="dom" />\nexport type Props = {};');
        write("docs/package.json", { name: "docs", architecture: "flat" });
        const isPureModule = readModulePurity(root);

        expect(
            ["@x/diff", "@x/merge", "@x/shared", "@x/view", "docs"].filter(isPureModule),
        ).toEqual(["@x/diff", "@x/merge"]);
    });
});
