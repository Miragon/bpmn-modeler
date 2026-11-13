import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../../fitness/__fixtures__/tempGitRepository";
import type { CoreScope } from "../../domain/contractSuites";
import { EngineContractSuiteSources } from "./engineContractSuiteSources";

const CORE = "@miragon/bpmn-modeler-core";
const TESTING = `${CORE}/testing`;
const PORTS = "libs/core/src/kernel/port/ports.ts";
const KIT = "libs/core/src/testing/index.ts";
const IN_MEMORY = "libs/core/src/testing/InMemoryFoo.ts";
const HOST = "apps/host/src/adapter/out/HostFoo.ts";
const HOST_SPEC = "apps/host/src/adapter/out/HostFoo.spec.ts";
const HOST_LITERAL = "apps/host/src/adapter/out/literalFoo.ts";

function implementation(className: string, from: string): string {
    return [
        `import type { Foo } from "${from}";`,
        "",
        `export class ${className} implements Foo {`,
        '    async read(): Promise<string> { return "read"; }',
        "}",
    ].join("\n");
}

function tsconfig(paths: Readonly<Record<string, string[]>>): string {
    return JSON.stringify({
        compilerOptions: {
            strict: true,
            lib: ["ES2021"],
            module: "esnext",
            moduleResolution: "bundler",
            paths,
        },
    });
}

const TREE: Readonly<Record<string, string>> = {
    "package.json": JSON.stringify({ private: true, workspaces: ["libs/*", "apps/*"] }),
    "tsconfig.base.json": tsconfig({
        [CORE]: ["./libs/core/src/index.ts"],
        [TESTING]: ["./libs/core/src/testing/index.ts"],
    }),
    "libs/core/package.json": JSON.stringify({ name: CORE, architecture: "hexagonal" }),
    "apps/host/package.json": JSON.stringify({ name: "host", architecture: "hexagonal" }),
    "apps/flat/package.json": JSON.stringify({ name: "flat", architecture: "flat" }),
    "libs/core/src/index.ts": 'export type { Foo } from "./kernel/port/ports";',
    [PORTS]: "export interface Foo {\n    read(): Promise<string>;\n}",
    [KIT]: [
        'import type { Foo } from "../kernel/port/ports";',
        "",
        "export function describeFoo(adapter: string, create: () => Foo): void {",
        "    void adapter;",
        "    void create;",
        "}",
    ].join("\n"),
    [IN_MEMORY]: implementation("InMemoryFoo", "../kernel/port/ports"),
    "libs/core/src/testing/InMemoryFoo.spec.ts": [
        'import { describeFoo } from "./index";',
        'import { InMemoryFoo } from "./InMemoryFoo";',
        "",
        'describeFoo("in memory", () => new InMemoryFoo());',
    ].join("\n"),
    [HOST]: implementation("HostFoo", CORE),
    [HOST_LITERAL]: [
        `import type { Foo } from "${CORE}";`,
        "",
        'export const literalFoo: Foo = { read: async () => "literal" };',
    ].join("\n"),
    "libs/core/src/kernel/adapter/out/defaultFoo.ts": [
        'import type { Foo } from "../../port/ports";',
        "",
        'export const DEFAULT_FOO: Foo = { read: async () => "default" };',
    ].join("\n"),
    "apps/host/src/__fixtures__/FixtureFoo.ts": implementation("FixtureFoo", CORE),
    "apps/host/src/types/shims.d.ts": "declare module 'shim';",
    "apps/flat/src/FlatFoo.ts": implementation("FlatFoo", CORE),
    "apps/host/src/kernel/port/HostOnly.ts": "export interface HostOnly {\n    read(): Promise<string>;\n}",
    "apps/host/src/adapter/out/HostOnlyAdapter.ts": [
        'import type { HostOnly } from "../../kernel/port/HostOnly";',
        "",
        "export class HostOnlyAdapter implements HostOnly {",
        '    async read(): Promise<string> { return "read"; }',
        "}",
    ].join("\n"),
    "apps/host/src/composition/wiring.ts": [
        'import { FlatFoo } from "../../../flat/src/FlatFoo";',
        'import { Untracked } from "../adapter/out/Untracked";',
        "",
        "export const adapters = [new FlatFoo(), new Untracked()];",
    ].join("\n"),
};

const SCOPE: CoreScope = {
    helperModule: KIT,
    coreSourceRoot: "libs/core/src/",
    hexagonalSourceRoots: ["libs/core/src/", "apps/host/src/"],
};

let repository: TempGitRepository;
let linkParent: string | undefined;

beforeEach(() => {
    repository = new TempGitRepository();
});

afterEach(() => {
    repository.remove();
    if (linkParent !== undefined) {
        rmSync(linkParent, { recursive: true, force: true });
        linkParent = undefined;
    }
});

function commitFiles(files: Readonly<Record<string, string | undefined>>): void {
    for (const [path, content] of Object.entries(files)) {
        if (content !== undefined) {
            repository.write(path, content);
        }
    }
    repository.git("add", "--all");
    repository.git("commit", "--quiet", "-m", "fixture");
}

const FOO = { path: PORTS, name: "Foo" };
const DESCRIBE_FOO = { path: KIT, name: "describeFoo" };

describe("the engine contract suite sources", () => {
    it("lay out the kit's file and the hexagonal workspaces", () => {
        commitFiles(TREE);

        expect(new EngineContractSuiteSources().readLayout(repository.root)).toEqual({
            helperModule: KIT,
            hexagonalWorkspaceDirs: ["libs/core", "apps/host"],
        });
    });

    it.each([
        {
            case: "without tsconfig.base.json",
            files: { "tsconfig.base.json": undefined },
            layout: { helperModule: undefined, hexagonalWorkspaceDirs: ["libs/core", "apps/host"] },
        },
        {
            case: "whose paths do not name the kit",
            files: { "tsconfig.base.json": tsconfig({ [CORE]: ["./libs/core/src/index.ts"] }) },
            layout: { helperModule: undefined, hexagonalWorkspaceDirs: ["libs/core", "apps/host"] },
        },
        {
            case: "whose kit lies in a flat workspace",
            files: {
                "libs/core/package.json": JSON.stringify({ name: CORE, architecture: "flat" }),
            },
            layout: { helperModule: KIT, hexagonalWorkspaceDirs: ["apps/host"] },
        },
    ])("lay out a tree $case", ({ files, layout }) => {
        commitFiles({ ...TREE, ...files });

        expect(new EngineContractSuiteSources().readLayout(repository.root)).toEqual(layout);
    });

    it("read the core's ports and the tracked classes of hexagonal workspaces and the object literals outside the core that meet them, not a host's port or a flat workspace's class", () => {
        commitFiles(TREE);
        repository.write("apps/host/src/adapter/out/Untracked.ts", implementation("Untracked", CORE));

        expect(new EngineContractSuiteSources().read(repository.root, SCOPE)).toEqual({
            ports: [{ ...FOO, members: [{ name: "read", returnsNothing: false, callable: true }] }],
            adapters: [
                { path: HOST, name: "HostFoo", line: 3, ports: [FOO] },
                { path: HOST_LITERAL, name: "literalFoo", line: 3, ports: [FOO] },
                { path: IN_MEMORY, name: "InMemoryFoo", line: 3, ports: [FOO] },
            ],
            helpers: [{ ...DESCRIBE_FOO, ports: [FOO] }],
            specs: [
                {
                    path: "libs/core/src/testing/InMemoryFoo.spec.ts",
                    adapters: [{ path: IN_MEMORY, name: "InMemoryFoo" }],
                    helpers: [DESCRIBE_FOO],
                },
            ],
        });
    });

    it("read a symlinked root as its real path, where an import through node_modules leads", () => {
        commitFiles({
            ...TREE,
            [HOST_SPEC]: [
                `import { describeFoo } from "${TESTING}";`,
                'import { HostFoo } from "host/src/adapter/out/HostFoo";',
                "",
                'describeFoo("host", () => new HostFoo());',
            ].join("\n"),
        });
        mkdirSync(join(repository.root, "node_modules"));
        symlinkSync("../apps/host", join(repository.root, "node_modules/host"), "dir");
        linkParent = mkdtempSync(join(tmpdir(), "contract-suites-link-"));
        symlinkSync(repository.root, join(linkParent, "repository"), "dir");

        expect(
            new EngineContractSuiteSources().read(join(linkParent, "repository"), SCOPE).specs,
        ).toContainEqual({
            path: HOST_SPEC,
            adapters: [{ path: HOST, name: "HostFoo" }],
            helpers: [DESCRIBE_FOO],
        });
    });
});
