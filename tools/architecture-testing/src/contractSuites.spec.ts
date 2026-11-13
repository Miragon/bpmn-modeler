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

export function describeAnything<F>(create: () => Promise<{ readonly anything: F }>): void {
    void create;
}

export function describeBoundFoo<F extends Foo>(create: () => F): void {
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

const CONSUMER = "/repo/core/service/consumer.ts";
const HOST_PREFERENCES = "/repo/host/HostPreferences.ts";
const STRUCTURAL = "/repo/host/structural.ts";
const WIRING = "/repo/host/composition/wiring.ts";
const STRUCTURAL_SPEC = "/repo/host/structural.spec.ts";

const consumerFromHost = "../core/service/consumer";
const consumerFromWiring = "../../core/service/consumer";
const portsFromWiring = "../../core/port/ports";
const corePortsFromService = "../port/ports";

const STRUCTURAL_FILES: Readonly<Record<string, string>> = {
    [PORTS]: FILES[PORTS],
    [VALUES]: FILES[VALUES],
    [KIT]: FILES[KIT],
    [MORE_KIT]: FILES[MORE_KIT],
    [RE_EXPORTED_KIT]: FILES[RE_EXPORTED_KIT],
    [CONSUMER]: `import type { Foo, Renderer } from "${corePortsFromService}";

export function consume(foo: Foo): void { void foo; }
export function maybeConsume(foo?: Foo): void { void foo; }
export function consumeBound<F extends Foo>(foo: F): void { void foo; }
export function render(renderer: Renderer): void { void renderer; }
export function dispose(disposable: { dispose(): void }): void { void disposable; }
export class Holder { read(): string { return "held"; } }
export function keep(holder: Holder): void { void holder; }

export interface Wiring {
    readonly foo?: Foo;
    readonly renderers: readonly Renderer[];
}
`,
    [HOST_PREFERENCES]: `export interface HostPreferences {
    read(): Promise<string>;
    extra(): boolean;
}

export interface Mirror {
    read(): Promise<string>;
    extra(): boolean;
}

export interface Unrelated {
    read(): Promise<string>;
}
`,
    [STRUCTURAL]: `import type { Foo } from "${corePorts}";
import { Holder } from "${consumerFromHost}";
import type { HostPreferences, Mirror, Unrelated } from "./HostPreferences";

export class ArgumentFoo { async read(): Promise<string> { return "argument"; } }
export class AssignedFoo { async read(): Promise<string> { return "assigned"; } }
export class ReturnedFoo { async read(): Promise<string> { return "returned"; } }
export class FieldFoo { async read(): Promise<string> { return "field"; } }
export class BoundFoo { async read(): Promise<string> { return "bound"; } }
export class OptionalFoo { async read(): Promise<string> { return "optional"; } }
export class ShorthandFoo { async read(): Promise<string> { return "shorthand"; } }
export class ArrayRenderer {
    show(): void { return; }
    async hide(): Promise<void> { return; }
    flush(): void { return; }
    async settle(): Promise<void> { return; }
}
export class BothWays implements Foo {
    async read(): Promise<string> { return "both"; }
    show(): void { return; }
    async hide(): Promise<void> { return; }
    flush(): void { return; }
    async settle(): Promise<void> { return; }
}
export class HostPreferencesClass implements HostPreferences {
    async read(): Promise<string> { return "host class"; }
    extra(): boolean { return true; }
}
export class DefaultFoo { async read(): Promise<string> { return "default"; } }
export class ConditionalFoo { async read(): Promise<string> { return "conditional"; } }
export class ExtendsArgumentFoo extends ArgumentFoo {}
export class NeverHandedOver { async read(): Promise<string> { return "never"; } }
export class DisposableThing { dispose(): void { return; } }
export class SpecialHolder extends Holder {}

export const typedFoo: Foo = { read: async () => "typed" };
export const untypedFoo = { read: async () => "untyped" };
export const satisfyingFoo = { read: async () => "satisfying" } satisfies Foo;
export const hostPreferences: HostPreferences = { read: async () => "host", extra: () => true };
export const mirrored: Mirror = { read: async () => "mirror", extra: () => false };
export const unrelated: Unrelated = { read: async () => "unrelated" };
export function createFoo(): Foo {
    return { read: async () => "created" };
}
export const arrowFoo = (): Foo => ({ read: async () => "arrow" });
`,
    [WIRING]: `import type { Foo } from "${portsFromWiring}";
import {
    consume,
    consumeBound,
    dispose,
    keep,
    maybeConsume,
    render,
    type Wiring,
} from "${consumerFromWiring}";
import type { HostPreferences, Mirror } from "../HostPreferences";
import {
    ArgumentFoo,
    ArrayRenderer,
    AssignedFoo,
    BothWays,
    BoundFoo,
    ConditionalFoo,
    DefaultFoo,
    DisposableThing,
    FieldFoo,
    OptionalFoo,
    ReturnedFoo,
    ShorthandFoo,
    SpecialHolder,
    untypedFoo,
} from "../structural";

consume(new ArgumentFoo());
consume(untypedFoo);
maybeConsume(new OptionalFoo());
consumeBound(new BoundFoo());
render(new BothWays());
dispose(new DisposableThing());
keep(new SpecialHolder());
consume({ read: async () => "inline" });

let assigned: Foo | undefined;
assigned = new AssignedFoo();

export function provide(): Foo {
    return new ReturnedFoo();
}

export class Composer {
    private readonly foo: Foo = new FieldFoo();

    build(): Foo {
        return { read: async () => "method" };
    }
}

export function withDefault(given: Foo = new DefaultFoo()): Foo {
    return given;
}

export const chosen: Foo = Math.random() > 0.5 ? new ArgumentFoo() : new ConditionalFoo();
export const mapped = [1].map((): Foo => ({ read: async () => "callback" }));
export const { read: destructured }: Foo = { read: async () => "destructured" };
export const blockArrow = (): Foo => {
    return new ReturnedFoo();
};
export const bare = new Composer;
let counter = 0;
counter += 1;

export function nothing(): void {
    return;
}

const foo = new ShorthandFoo();
export const wiring: Wiring = { foo, renderers: [new ArrayRenderer()] };

export function hostAsFoo(preferences: HostPreferences): void {
    consume(preferences);
}

export function mirror(preferences: HostPreferences): Mirror {
    return preferences;
}

export function back(mirrored: Mirror): HostPreferences {
    return mirrored;
}
`,
    [STRUCTURAL_SPEC]: `import { describeFoo } from "${kit}";
import { consume } from "${consumerFromHost}";
import { ArgumentFoo, NeverHandedOver, typedFoo } from "./structural";

consume(new NeverHandedOver());
describeFoo("argument", async () => ({ foo: new ArgumentFoo() }));
describeFoo("typed", async () => ({ foo: typedFoo }));
`,
};

const SCOPE: ContractSuiteScope = {
    isPortFile: (fileName) => fileName.includes("/port/"),
    isAdapterFile: (fileName) => !fileName.includes(".spec."),
    isLiteralAdapterFile: (fileName) => !fileName.includes(".spec."),
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
    { name: "show", returnsNothing: true, callable: true },
    { name: "hide", returnsNothing: true, callable: true },
    { name: "flush", returnsNothing: true, callable: true },
    { name: "settle", returnsNothing: true, callable: true },
    { name: "reload", returnsNothing: true, callable: true },
];

describe("findContractSuites", () => {
    it("lists each interface of a port file once, with whether each member can be called and returns nothing", () => {
        expect(suites.ports).toEqual([
            { ...FOO, line: 3, members: [{ name: "read", returnsNothing: false, callable: true }] },
            { ...RENDERER, line: 7, members: RENDERER_MEMBERS },
            {
                fileName: PORTS,
                name: "Reader",
                line: 15,
                members: [
                    { name: "id", returnsNothing: false, callable: false },
                    { name: "withProgress", returnsNothing: false, callable: true },
                    { name: "pick", returnsNothing: false, callable: true },
                ],
            },
            {
                ...HANDLE,
                line: 22,
                members: [
                    { name: "isActive", returnsNothing: false, callable: true },
                    ...RENDERER_MEMBERS,
                ],
            },
            {
                fileName: PORTS,
                name: "Merged",
                line: 26,
                members: [
                    { name: "first", returnsNothing: true, callable: true },
                    { name: "second", returnsNothing: false, callable: true },
                ],
            },
            {
                ...BOX,
                line: 34,
                members: [
                    { name: "get", returnsNothing: false, callable: true },
                    { name: "odd", returnsNothing: false, callable: true },
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
            { fileName: KIT, name: "describeGenericFoo", ports: [FOO] },
            { fileName: KIT, name: "describeDisposableFoo", ports: [FOO] },
            { fileName: KIT, name: "describeBoundFoo", ports: [FOO] },
            { fileName: KIT, name: "runFoo", ports: [FOO] },
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

    describe("an adapter without an implements clause", () => {
        const structural = findContractSuites(programOf(STRUCTURAL_FILES), SCOPE);
        const adapter = (name: string, line: number, ports = [FOO]) => ({
            fileName: STRUCTURAL,
            name,
            line,
            ports,
        });

        // BoundFoo meets a type parameter bounded by the port, which the checker infers as the class itself.
        it("lists a named class a production file hands over where a port is expected, also through a host interface", () => {
            expect(structural.adapters.filter(({ name }) => /^[A-Z]/.test(name))).toEqual([
                adapter("ArgumentFoo", 5),
                adapter("AssignedFoo", 6),
                adapter("ReturnedFoo", 7),
                adapter("FieldFoo", 8),
                adapter("OptionalFoo", 10),
                adapter("ShorthandFoo", 11),
                adapter("ArrayRenderer", 12, [RENDERER]),
                adapter("BothWays", 18, [FOO, RENDERER]),
                adapter("HostPreferencesClass", 25),
                adapter("DefaultFoo", 29),
                adapter("ConditionalFoo", 30),
            ]);
        });

        it("lists an object literal by the variable or function that names it", () => {
            expect(structural.adapters.filter(({ name }) => /^[a-z]/.test(name))).toEqual([
                adapter("typedFoo", 36),
                adapter("untypedFoo", 37),
                adapter("satisfyingFoo", 38),
                adapter("hostPreferences", 39),
                adapter("mirrored", 40),
                adapter("createFoo", 42),
                adapter("arrowFoo", 45),
            ]);
        });

        it("lists no object literal in a file the scope keeps literals out of, but still follows its handovers", () => {
            const classesOnly = findContractSuites(programOf(STRUCTURAL_FILES), {
                ...SCOPE,
                isLiteralAdapterFile: (fileName) => fileName !== STRUCTURAL,
            });

            expect(classesOnly.adapters.map(({ name }) => name)).toEqual(
                structural.adapters
                    .filter(({ name }) => /^[A-Z]/.test(name))
                    .map(({ name }) => name),
            );
        });

        it("covers an object literal adapter a spec imports as a value, and ignores what a spec hands over", () => {
            expect(structural.specs).toEqual([
                {
                    fileName: STRUCTURAL_SPEC,
                    adapters: [
                        { fileName: STRUCTURAL, name: "ArgumentFoo" },
                        { fileName: STRUCTURAL, name: "typedFoo" },
                    ],
                    helpers: [DESCRIBE_FOO],
                },
            ]);
        });
    });
});
