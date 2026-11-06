import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../fitness/__fixtures__/tempGitRepository";
import { functionReport } from "../../fitness/domain/report";
import { measure } from "../../fitness/service/measurement";
import { EngineContractSuiteSources } from "../adapter/out/engineContractSuiteSources";
import { createContractSuitesFitnessFunction } from "./contractSuitesFitnessFunction";

const CORE = "@miragon/bpmn-modeler-core";
const TESTING = `${CORE}/testing`;
const FOO_A = "apps/a/src/adapter/out/FooA.ts";
const FOO_B = "apps/b/src/adapter/out/FooB.ts";
const FOO_A_SPEC = "apps/a/src/adapter/out/FooA.spec.ts";
const FOO_B_SPEC = "apps/b/src/adapter/out/FooB.spec.ts";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
});

afterEach(() => {
    repository.remove();
});

const contractSuites = createContractSuitesFitnessFunction({
    sources: new EngineContractSuiteSources(),
});

function hexagonal(name: string): string {
    return JSON.stringify({ name, architecture: "hexagonal" });
}

function adapter(className: string, port = "Foo"): string {
    return [
        `import type { ${port} } from "${CORE}";`,
        "",
        `export class ${className} implements ${port} {`,
        '    async read(): Promise<string> { return "read"; }',
        "    show(): void { return; }",
        "    async hide(): Promise<void> { return; }",
        "}",
    ].join("\n");
}

function spec(...lines: string[]): string {
    return lines.join("\n");
}

const TREE: Readonly<Record<string, string>> = {
    "package.json": JSON.stringify({ private: true, workspaces: ["libs/*", "apps/*"] }),
    "tsconfig.base.json": JSON.stringify({
        compilerOptions: {
            strict: true,
            target: "ES2021",
            lib: ["ES2021"],
            module: "esnext",
            moduleResolution: "bundler",
            paths: {
                [CORE]: ["./libs/core/src/index.ts"],
                [TESTING]: ["./libs/core/src/testing/index.ts"],
            },
        },
    }),
    "libs/core/package.json": hexagonal(CORE),
    "apps/a/package.json": hexagonal("a"),
    "apps/b/package.json": hexagonal("b"),
    "libs/core/src/index.ts": [
        'export type { Foo, FooPort, Renderer } from "./foo/port/Foo";',
        'export type { BarPort } from "./foo/domain/BarPort";',
    ].join("\n"),
    "libs/core/src/foo/port/Foo.ts": [
        "export interface Foo {",
        "    read(): Promise<string>;",
        "}",
        "",
        "export interface FooPort {",
        "    read(): Promise<string>;",
        "}",
        "",
        "export interface Renderer {",
        "    show(): void;",
        "    hide(): Promise<void>;",
        "}",
    ].join("\n"),
    "libs/core/src/foo/domain/BarPort.ts": "export interface BarPort { read(): Promise<string>; }",
    "libs/core/src/testing/index.ts": 'export * from "./fooContract";',
    "libs/core/src/testing/fooContract.ts": [
        'import type { Foo } from "../foo/port/Foo";',
        "",
        "export interface FooContractFixture {",
        "    readonly foo: Foo;",
        "}",
        "",
        "export function describeFooContract(adapter: string, create: () => Promise<FooContractFixture>): void {",
        "    void adapter;",
        "    void create;",
        "}",
        "",
        "export function runFooScenarios(adapter: string, create: () => Promise<FooContractFixture>): void {",
        "    void adapter;",
        "    void create;",
        "}",
    ].join("\n"),
    [FOO_A]: adapter("FooA"),
    [FOO_B]: adapter("FooB"),
    [FOO_A_SPEC]: spec(
        `import { describeFooContract } from "${TESTING}";`,
        'import { FooA } from "./FooA";',
        "",
        'describeFooContract("on a fake", async () => ({ foo: new FooA() }));',
    ),
};

function commitFiles(files: Readonly<Record<string, string>>): void {
    for (const [path, content] of Object.entries(files)) {
        repository.write(path, content);
    }
    repository.git("add", "--all");
    repository.git("commit", "--quiet", "-m", "fixture");
}

function measureTree(commit: string) {
    return measure(contractSuites, { repoRoot: repository.root, commit, changeBase: commit });
}

function findingsOf(files: Readonly<Record<string, string>>) {
    commitFiles({ ...TREE, ...files });
    const measurement = measureTree("head");
    return "findings" in measurement ? measurement.findings : [];
}

function pairsOf(files: Readonly<Record<string, string>>): string[] {
    return findingsOf(files).map(({ path, group }) => `${group} ${path}`);
}

describe("the contract suites fitness function on a hand-built tree", () => {
    it("lists the adapter whose spec runs no suite of its port, and not the one whose spec does", () => {
        expect(findingsOf({})).toEqual([
            {
                key: "apps/b/src/adapter/out/FooB.ts#FooB → libs/core/src/foo/port/Foo.ts#Foo",
                path: FOO_B,
                line: 3,
                message:
                    "`FooB`: runs no `Foo` suite (`describeFooContract`, `runFooScenarios`); `FooA` does",
                group: "skips-suite",
                rank: 1,
            },
        ]);
    });

    it("still lists an adapter whose spec imports it and calls no helper", () => {
        expect(
            pairsOf({
                [FOO_B_SPEC]: spec(
                    'import { FooB } from "./FooB";',
                    "",
                    "export const read = () => new FooB().read();",
                ),
            }),
        ).toEqual([`skips-suite ${FOO_B}`]);
    });

    it("lists an adapter whose spec calls the helper without importing it", () => {
        expect(
            pairsOf({
                [FOO_B_SPEC]: spec(
                    `import { describeFooContract } from "${TESTING}";`,
                    "",
                    'describeFooContract("FooB", async () => ({ foo: { read: async () => "b" } }));',
                ),
            }),
        ).toEqual([`skips-suite ${FOO_B}`]);
    });

    it("counts a helper with another name and the same parameter type", () => {
        expect(
            pairsOf({
                [FOO_B_SPEC]: spec(
                    `import { runFooScenarios } from "${TESTING}";`,
                    'import { FooB } from "./FooB";',
                    "",
                    'runFooScenarios("FooB", async () => ({ foo: new FooB() }));',
                ),
            }),
        ).toEqual([]);
    });

    it("reads no port from an interface's name: FooPort without a class, BarPort outside port/", () => {
        expect(
            pairsOf({
                "apps/a/src/adapter/out/Bar.ts": adapter("Bar", "BarPort"),
                [FOO_B_SPEC]: spec(
                    `import { describeFooContract } from "${TESTING}";`,
                    'import { FooB } from "./FooB";',
                    "",
                    'describeFooContract("FooB", async () => ({ foo: new FooB() }));',
                ),
            }),
        ).toEqual([]);
    });

    it("marks a port whose methods all return void or Promise<void> render-only, not missing a suite", () => {
        expect(
            pairsOf({
                "apps/a/src/adapter/out/StatusA.ts": adapter("StatusA", "Renderer"),
                [FOO_B_SPEC]: spec(
                    `import { describeFooContract } from "${TESTING}";`,
                    'import { FooB } from "./FooB";',
                    "",
                    'describeFooContract("FooB", async () => ({ foo: new FooB() }));',
                ),
            }),
        ).toEqual(["render-only apps/a/src/adapter/out/StatusA.ts"]);
    });

    it("lists a third adapter of a port with a suite as new until its spec runs the suite", () => {
        commitFiles({
            ...TREE,
            [FOO_B_SPEC]: spec(
                `import { describeFooContract } from "${TESTING}";`,
                'import { FooB } from "./FooB";',
                "",
                'describeFooContract("FooB", async () => ({ foo: new FooB() }));',
            ),
        });
        const base = measureTree("base");

        commitFiles({ "apps/b/src/adapter/out/FooC.ts": adapter("FooC") });
        const report = functionReport(contractSuites, measureTree("head"), {
            source: "checkout",
            measurement: base,
        });

        expect(report.outcome).toEqual({
            kind: "measured",
            findings: [
                expect.objectContaining({
                    path: "apps/b/src/adapter/out/FooC.ts",
                    group: "skips-suite",
                    status: "new",
                }),
            ],
            resolved: [],
        });
    });

    it("is unmeasurable on a tree whose paths name no contract helper module", () => {
        commitFiles({ "package.json": JSON.stringify({ private: true, workspaces: [] }) });

        expect(measureTree("head")).toEqual({
            unmeasurable: `no tsconfig.base.json path resolves ${TESTING}`,
        });
    });

    it("is unmeasurable on a tree whose core declares no interface in a port/ folder", () => {
        commitFiles({
            ...TREE,
            "libs/core/src/foo/port/Foo.ts": "export const NO_PORT = true;",
            "libs/core/src/foo/ports/Foo.ts": TREE["libs/core/src/foo/port/Foo.ts"],
        });

        expect(measureTree("head")).toEqual({
            unmeasurable: `the workspace of ${TESTING} declares no interface in a port/ folder`,
        });
    });
});
