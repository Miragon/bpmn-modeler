import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../../fitness/__fixtures__/tempGitRepository";
import { EngineContractSuiteSources } from "./engineContractSuiteSources";

const CORE = "@miragon/bpmn-modeler-core";
const TESTING = `${CORE}/testing`;
const PORTS = "libs/core/src/kernel/port/ports.ts";
const KIT = "libs/core/src/testing/index.ts";
const IN_MEMORY = "libs/core/src/testing/InMemoryFoo.ts";
const HOST = "apps/host/src/adapter/out/HostFoo.ts";

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
    "apps/host/src/__fixtures__/FixtureFoo.ts": implementation("FixtureFoo", CORE),
    "apps/host/src/types/shims.d.ts": "declare module 'shim';",
    "apps/flat/src/FlatFoo.ts": implementation("FlatFoo", CORE),
};

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
});

afterEach(() => {
    repository.remove();
});

function commitFiles(files: Readonly<Record<string, string>>): void {
    for (const [path, content] of Object.entries(files)) {
        repository.write(path, content);
    }
    repository.git("add", "--all");
    repository.git("commit", "--quiet", "-m", "fixture");
}

const FOO = { path: PORTS, name: "Foo" };

describe("the engine contract suite sources", () => {
    it("read the core's ports, the classes of every hexagonal workspace that implement them, the kit's helpers and the specs", () => {
        commitFiles(TREE);
        repository.write("apps/host/src/adapter/out/Untracked.ts", implementation("Untracked", CORE));

        expect(new EngineContractSuiteSources().read(repository.root)).toEqual({
            ports: [{ ...FOO, members: [{ name: "read", returnsNothing: false }] }],
            adapters: [
                { path: HOST, name: "HostFoo", line: 3, ports: [FOO] },
                { path: IN_MEMORY, name: "InMemoryFoo", line: 3, ports: [FOO] },
            ],
            helpers: [{ path: KIT, name: "describeFoo", ports: [FOO] }],
            specs: [
                {
                    path: "libs/core/src/testing/InMemoryFoo.spec.ts",
                    adapters: [{ path: IN_MEMORY, name: "InMemoryFoo" }],
                    helpers: [{ path: KIT, name: "describeFoo" }],
                },
            ],
        });
    });

    it.each([
        {
            case: "without tsconfig.base.json",
            files: { "tsconfig.base.json": undefined },
        },
        {
            case: "whose paths do not name the kit",
            files: { "tsconfig.base.json": tsconfig({ [CORE]: ["./libs/core/src/index.ts"] }) },
        },
        {
            case: "whose kit lies in no hexagonal workspace",
            files: {
                "libs/core/package.json": JSON.stringify({ name: CORE, architecture: "flat" }),
            },
        },
    ])("read nothing from a tree $case", ({ files }) => {
        commitFiles(
            Object.fromEntries(
                Object.entries({ ...TREE, ...files }).flatMap(([path, content]) =>
                    content === undefined ? [] : [[path, content]],
                ),
            ),
        );

        expect(new EngineContractSuiteSources().read(repository.root)).toBeUndefined();
    });
});
