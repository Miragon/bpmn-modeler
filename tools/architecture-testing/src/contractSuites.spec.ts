import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { type ContractSuiteScope, findContractSuites } from "./contractSuites";

const PORTS = "/repo/core/port/ports.ts";
const VALUES = "/repo/core/domain/values.ts";
const KIT = "/repo/core/testing/index.ts";
const MORE_KIT = "/repo/core/testing/more.ts";
const RE_EXPORTED_KIT = "/repo/core/testing/reExported.ts";
const HOST_HANDLE = "/repo/host/HostHandle.ts";
const ADAPTERS = "/repo/host/adapters.ts";
const DEFAULT_ADAPTER = "/repo/host/defaultAdapter.ts";
const ADAPTERS_SPEC = "/repo/host/adapters.spec.ts";
const NAMESPACE_SPEC = "/repo/host/namespace.spec.ts";

// Interpolated, so the trigger-path check does not read the fixture imports as the spec's own.
const corePorts = "../core/port/ports";
const kit = "../core/testing/index";

const FILES: Readonly<Record<string, string>> = {
    [PORTS]: `import type { Shown } from "../domain/values";

export interface Foo {
    read(): Promise<string>;
}

export interface Renderer {
    show(view: Shown): void;
    hide(): Promise<void>;
    flush(): void | Promise<void>;
    settle(): PromiseLike<void>;
    reload?(): void;
}

export interface Reader {
    readonly id: string;
    withProgress<T>(task: () => Promise<T>): Promise<T>;
    pick(): void;
    pick(all: boolean): string[];
}

export interface Handle extends Renderer {
    isActive(): boolean;
}

export interface Merged {
    first(): void;
}

export interface Merged {
    second(): string;
}

export interface Box<T> {
    get(): T;
    odd(): { then(resolve: string): void };
}

export type Alias = { read(): string };
`,
    [VALUES]: `export interface Shown {
    readonly text: string;
}

export interface NotAPort {
    read(): string;
}
`,
    [HOST_HANDLE]: `import type { Handle } from "${corePorts}";

export interface HostHandle extends Handle {
    receive(): void;
}
`,
    [ADAPTERS]: `import type { Alias, Box, Foo, Merged, Renderer } from "${corePorts}";
import type { NotAPort } from "../core/domain/values";
import type { HostHandle } from "./HostHandle";

export class FooAdapter implements Foo {
    async read(): Promise<string> { return "foo"; }
}

export class HostRenderer implements HostHandle, Renderer {
    show(): void { return; }
    async hide(): Promise<void> { return; }
    flush(): void { return; }
    async settle(): Promise<void> { return; }
    isActive(): boolean { return true; }
    receive(): void { return; }
}

export class Plain implements NotAPort {
    read(): string { return "plain"; }
}

export class Aliased implements Alias {
    read(): string { return "alias"; }
}

export class Unresolved implements Missing {}

export const anonymous = class implements Foo {
    async read(): Promise<string> { return "anonymous"; }
};

export class NoClause {}

export class StringBox implements Box<string> {
    get(): string { return "box"; }
    odd(): { then(resolve: string): void } { return { then: () => undefined }; }
}

type FooAndMerged = Foo & Merged;

export class Combined implements FooAndMerged {
    async read(): Promise<string> { return "combined"; }
    first(): void { return; }
    second(): string { return "second"; }
}
`,
    [DEFAULT_ADAPTER]: `import type { Foo } from "${corePorts}";

export default class DefaultAdapter implements Foo {
    async read(): Promise<string> { return "default"; }
}
`,
    [KIT]: `import type { Foo, Renderer } from "../port/ports";

export interface FooFixture {
    readonly foo: Foo;
    readonly label?: string;
}

export interface Options {
    readonly verbose: boolean;
}

export function describeFoo(adapter: string, create: () => Promise<FooFixture>): void {
    void adapter;
    void create;
}

export const runFoo = (adapter: string, create?: () => Foo): void => {
    void adapter;
    void create;
};

export function describeGenericFoo<F extends Foo>(
    adapter: string,
    create: () => Promise<{ readonly foo: F }>,
): void {
    void adapter;
    void create;
}

export function describeDisposableFoo(create: () => Foo & { dispose(): void }): void {
    void create;
}

export function describeAnything<F>(create: () => F): void {
    void create;
}

export function describeRenderer(adapter: string, renderer: Renderer): void {
    void adapter;
    void renderer;
}

export const LABEL = "contract";

export { describeFoo as describeFooAgain };
export { describeBox } from "./reExported";

export * from "./more";
`,
    [RE_EXPORTED_KIT]: `import type { Box } from "../port/ports";

export function describeBox(create: () => Box<string>): void {
    void create;
}
`,
    [MORE_KIT]: `import type { Handle } from "../port/ports";

export function describeHandle(create: () => Handle | undefined): void {
    void create;
}
`,
    [ADAPTERS_SPEC]: `import "./setup";
import { describeFoo } from "${kit}";
import type { Foo } from "${corePorts}";
import { FooAdapter } from "./adapters";

class SpecFake implements Foo {
    async read(): Promise<string> { return "fake"; }
}

function label(): string {
    return "FooAdapter";
}

describeFoo(label(), async () => ({ foo: new FooAdapter() }));
describeFoo("fake", async () => ({ foo: new SpecFake() }));
missing();
`,
    [NAMESPACE_SPEC]: `import DefaultAdapter from "./defaultAdapter";
import * as kit from "${kit}";

kit.describeFoo("default", async () => ({ foo: new DefaultAdapter() }));
`,
    "/repo/host/typeOnly.spec.ts": `import type { FooAdapter } from "./adapters";
import { type HostRenderer } from "./adapters";
import { describeFoo } from "${kit}";

describeFoo("typed", async (): Promise<{ foo: FooAdapter }> => ({ foo: undefined as never }));
export type Shown = HostRenderer;
`,
    "/repo/host/noAdapter.spec.ts": `import { describeFoo } from "${kit}";

describeFoo("literal", async () => ({ foo: { read: async () => "literal" } }));
`,
    "/repo/script.ts": "const local = 1;\n",
};

const SCOPE: ContractSuiteScope = {
    isPortFile: (fileName) => fileName.includes("/port/"),
    isAdapterFile: (fileName) => !fileName.includes(".spec."),
    isSpecFile: (fileName) => fileName.includes(".spec."),
    helperModule: KIT,
};

const OPTIONS: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    target: ts.ScriptTarget.ES2021,
    lib: ["lib.es2021.d.ts"],
    types: [],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
};

const libraryHost = ts.createCompilerHost(OPTIONS);
const libraryFiles = new Map<string, ts.SourceFile | undefined>();

function programOf(files: Readonly<Record<string, string>>): ts.Program {
    const host: ts.CompilerHost = {
        ...libraryHost,
        fileExists: (fileName) => fileName in files || libraryHost.fileExists(fileName),
        directoryExists: (dir) =>
            Object.keys(files).some((fileName) => fileName.startsWith(`${dir}/`)),
        realpath: (path) => path,
        readFile: (fileName) => files[fileName] ?? libraryHost.readFile(fileName),
        getSourceFile: (fileName, languageVersion) => {
            if (fileName in files) {
                return ts.createSourceFile(fileName, files[fileName], languageVersion);
            }
            if (!libraryFiles.has(fileName)) {
                libraryFiles.set(fileName, libraryHost.getSourceFile(fileName, languageVersion));
            }
            return libraryFiles.get(fileName);
        },
    };
    return ts.createProgram({ rootNames: Object.keys(files), options: OPTIONS, host });
}

const suites = findContractSuites(programOf(FILES), SCOPE);

const FOO = { fileName: PORTS, name: "Foo" };
const RENDERER = { fileName: PORTS, name: "Renderer" };
const HANDLE = { fileName: PORTS, name: "Handle" };
const BOX = { fileName: PORTS, name: "Box" };
const MERGED = { fileName: PORTS, name: "Merged" };
const DESCRIBE_FOO = { fileName: KIT, name: "describeFoo" };
const RENDERER_MEMBERS = [
    { name: "show", returnsNothing: true },
    { name: "hide", returnsNothing: true },
    { name: "flush", returnsNothing: true },
    { name: "settle", returnsNothing: true },
    { name: "reload", returnsNothing: true },
];

describe("findContractSuites", () => {
    it("lists each interface of a port file once, with whether each member returns nothing", () => {
        expect(suites.ports).toEqual([
            { ...FOO, line: 3, members: [{ name: "read", returnsNothing: false }] },
            { ...RENDERER, line: 7, members: RENDERER_MEMBERS },
            {
                fileName: PORTS,
                name: "Reader",
                line: 15,
                members: [
                    { name: "id", returnsNothing: false },
                    { name: "withProgress", returnsNothing: false },
                    { name: "pick", returnsNothing: false },
                ],
            },
            {
                ...HANDLE,
                line: 22,
                members: [{ name: "isActive", returnsNothing: false }, ...RENDERER_MEMBERS],
            },
            {
                fileName: PORTS,
                name: "Merged",
                line: 26,
                members: [
                    { name: "first", returnsNothing: true },
                    { name: "second", returnsNothing: false },
                ],
            },
            {
                ...BOX,
                line: 34,
                members: [
                    { name: "get", returnsNothing: false },
                    { name: "odd", returnsNothing: false },
                ],
            },
        ]);
    });

    it("lists each named class outside specs whose implements clause reaches a port, generic, through extended interfaces or an intersection", () => {
        expect(suites.adapters).toEqual([
            { fileName: ADAPTERS, name: "FooAdapter", line: 5, ports: [FOO] },
            { fileName: ADAPTERS, name: "HostRenderer", line: 9, ports: [HANDLE, RENDERER] },
            { fileName: ADAPTERS, name: "StringBox", line: 34, ports: [BOX] },
            { fileName: ADAPTERS, name: "Combined", line: 41, ports: [FOO, MERGED] },
            { fileName: DEFAULT_ADAPTER, name: "DefaultAdapter", line: 3, ports: [FOO] },
        ]);
    });

    it("lists each exported function whose parameter is a factory of a port or of a fixture holding one, bounded by it, in an intersection or re-exported", () => {
        expect(suites.helpers).toEqual([
            { ...DESCRIBE_FOO, ports: [FOO] },
            { fileName: KIT, name: "runFoo", ports: [FOO] },
            { fileName: KIT, name: "describeGenericFoo", ports: [FOO] },
            { fileName: KIT, name: "describeDisposableFoo", ports: [FOO] },
            { fileName: RE_EXPORTED_KIT, name: "describeBox", ports: [BOX] },
            { fileName: MORE_KIT, name: "describeHandle", ports: [HANDLE, RENDERER] },
        ]);
    });

    it("lists each spec that imports an adapter as a value, with the helpers it calls", () => {
        expect(suites.specs).toEqual([
            {
                fileName: ADAPTERS_SPEC,
                adapters: [{ fileName: ADAPTERS, name: "FooAdapter" }],
                helpers: [DESCRIBE_FOO],
            },
            {
                fileName: NAMESPACE_SPEC,
                adapters: [{ fileName: DEFAULT_ADAPTER, name: "DefaultAdapter" }],
                helpers: [DESCRIBE_FOO],
            },
        ]);
    });

    it("finds no helper in a helper module that is no module", () => {
        expect(
            findContractSuites(programOf(FILES), { ...SCOPE, helperModule: "/repo/script.ts" })
                .helpers,
        ).toEqual([]);
    });

    it("throws when the helper module is not in the program", () => {
        expect(() =>
            findContractSuites(programOf(FILES), { ...SCOPE, helperModule: "/repo/moved.ts" }),
        ).toThrow("/repo/moved.ts is not in the program");
    });
});
