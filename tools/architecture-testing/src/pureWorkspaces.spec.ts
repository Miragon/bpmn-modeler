import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildImportGraph } from "./importGraph";
import type { PathAlias } from "./pathAliases";
import { impureDomainImports, pureWorkspaces, readPureWorkspaces } from "./pureWorkspaces";
import type { WorkspaceSources } from "./pureWorkspaces";
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

function pureNames(shapes: readonly WorkspaceShape[]): string[] {
    return pureWorkspaces(sourcesOf(shapes), aliasesOf(shapes), compilesWithDomOf(shapes)).map(
        ({ name }) => name,
    );
}

function flat(
    name: string,
    files: Readonly<Record<string, string>>,
    withDom = false,
): WorkspaceShape {
    return { name, kind: "flat", withDom, files };
}

describe("pureWorkspaces", () => {
    it("reads a flat workspace whose program loads no DOM and that reaches no platform module as pure", () => {
        expect(pureNames([flat("@x/diff", { "index.ts": 'export const diff = "";' })])).toEqual([
            "@x/diff",
        ]);
    });

    it("follows imports to the file, so a DOM-free entry of a workspace with DOM chrome keeps its importer pure", () => {
        const types = flat(
            "@x/types",
            {
                "index.ts": 'export * from "./engine";\nexport * from "./canvas";',
                "engine.ts": 'export type Engine = "c7" | "c8";',
                "canvas.ts": "export const fit = () => document.body;",
            },
            true,
        );
        const merge = flat("@x/merge", {
            "index.ts": 'import type { Engine } from "@x/types/engine";\nimport "./build";',
            "build.ts": 'import { diff } from "@x/diff";',
        });
        const diff = flat("@x/diff", { "index.ts": "export const diff = 1;" });

        expect(pureNames([types, merge, diff])).toEqual(["@x/merge", "@x/diff"]);
    });

    it("reads a flat workspace whose program loads the DOM as impure, whatever it imports", () => {
        expect(pureNames([flat("@x/shared", { "index.ts": "export {};" }, true)])).toEqual([]);
    });

    it("asks the compiler only about a flat workspace that reaches only pure code", () => {
        const shapes = [
            flat("@x/diff", { "index.ts": "export {};" }),
            flat("@x/reader", { "index.ts": 'import "node:fs";' }),
            { name: "@x/core", kind: "hexagonal", files: { "index.ts": "export {};" } },
        ];
        const asked: string[] = [];

        pureWorkspaces(sourcesOf(shapes), aliasesOf(shapes), ({ name }) => {
            asked.push(name);
            return false;
        });

        expect(asked).toEqual(["@x/diff"]);
    });

    it.each(["hexagonal", "diagram-js", undefined])(
        "reads a workspace of kind %s as impure, even compiled without the DOM",
        (kind) => {
            const shape: WorkspaceShape = {
                name: "@x/core",
                files: { "index.ts": "export {};" },
                ...(kind === undefined ? {} : { kind }),
            };

            expect(pureNames([shape])).toEqual([]);
        },
    );

    it("reads a flat workspace that reaches node:fs through another workspace as impure, and that one too", () => {
        const reader = flat("@x/reader", {
            "index.ts": 'import "./files";',
            "files.ts": 'import { readFileSync } from "node:fs";',
        });
        const rules = flat("@x/rules", { "index.ts": 'export * from "@x/reader";' });

        expect(pureNames([reader, rules])).toEqual([]);
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
        expect(pureNames([flat("@x/lib", { "index.ts": `import "${specifier}";` })])).toEqual([]);
    });

    it("reads a package outside the repo as a leaf it does not follow", () => {
        expect(pureNames([flat("@x/diff", { "index.ts": 'import "bpmn-moddle";' })])).toEqual([
            "@x/diff",
        ]);
    });

    it("reads a workspace import that resolves to no file as impure, as it cannot be followed", () => {
        const merge = flat("@x/merge", { "index.ts": 'import "@x/diff/missing";' });
        const diff = flat("@x/diff", { "index.ts": "export {};" });

        expect(pureNames([merge, diff])).toEqual(["@x/diff"]);
    });

    it("reads a flat workspace that reaches a file of a non-flat workspace as impure", () => {
        const rules = flat("@x/rules", { "index.ts": 'import "@x/core/domain/errors";' });
        const core: WorkspaceShape = {
            name: "@x/core",
            kind: "hexagonal",
            files: { "domain/errors.ts": "export {};" },
        };

        expect(pureNames([rules, core])).toEqual([]);
    });

    it("ends on an import cycle between workspaces", () => {
        const left = flat("@x/left", { "index.ts": 'import "@x/right";' });
        const right = flat("@x/right", { "index.ts": 'import "@x/left";' });

        expect(pureNames([left, right])).toEqual(["@x/left", "@x/right"]);
    });
});

describe("impureDomainImports", () => {
    const PURE = [{ name: "@x/merge", dir: "libs/merge", kind: "flat" }];

    function offendersOf(path: string, text: string): string[] {
        return impureDomainImports(buildImportGraph([{ path, text }]), PURE).map(
            ({ from, specifier }) => `${from} -> ${specifier}`,
        );
    }

    it.each([
        ["a value import", 'import { MERGE_SIDES } from "@x/merge";'],
        ["a type import", 'import type { MergeRefusal } from "@x/merge";'],
        ["a subpath", 'import { closePicks } from "@x/merge/closure";'],
        ["a relative import", 'import { x } from "./rules";'],
    ])("allows %s of a pure workspace or the tree", (_name, text) => {
        expect(offendersOf("diff/domain/x.ts", text)).toEqual([]);
    });

    it.each([
        [
            "an impure workspace, even type-only",
            'import type { Query } from "@x/shared";',
            "@x/shared",
        ],
        ["a package outside the repo", 'import debounce from "lodash";', "lodash"],
        ["a platform module", 'import { posix } from "path";', "path"],
        ["a workspace whose name extends a pure one", 'import "@x/merge-tools";', "@x/merge-tools"],
    ])("refuses %s", (_name, text, specifier) => {
        expect(offendersOf("diff/domain/x.ts", text)).toEqual([`diff/domain/x.ts -> ${specifier}`]);
    });

    it("reads only domain/ files", () => {
        expect(offendersOf("diff/service/x.ts", 'import "@x/shared";')).toEqual([]);
    });
});

describe("readPureWorkspaces", () => {
    let root: string;

    const write = (path: string, content: object | string): void => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(
            join(root, path),
            typeof content === "string" ? content : JSON.stringify(content),
        );
    };

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), "pure-workspaces-"));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it("reads the manifests, the compiler programs, the sources and the path aliases of the repo", () => {
        write("package.json", { workspaces: ["libs/*", "docs"] });
        write("tsconfig.base.json", {
            compilerOptions: {
                lib: ["ES2021", "DOM"],
                paths: { "@x/diff": ["./libs/diff/src/index.ts"] },
            },
        });
        write("libs/diff/package.json", { name: "@x/diff", architecture: "flat" });
        write("libs/diff/tsconfig.json", {
            extends: "../../tsconfig.base.json",
            compilerOptions: { lib: ["ESNext"] },
        });
        write("libs/diff/src/index.ts", "export const diff = 1;");
        write("libs/merge/package.json", { name: "@x/merge", architecture: "flat" });
        write("libs/merge/tsconfig.json", {
            extends: "../../tsconfig.base.json",
            compilerOptions: { lib: ["ES2021"] },
        });
        write("libs/merge/src/index.ts", 'import { diff } from "@x/diff";');
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

        expect(readPureWorkspaces(root).map(({ name }) => name)).toEqual(["@x/diff", "@x/merge"]);
    });
});
