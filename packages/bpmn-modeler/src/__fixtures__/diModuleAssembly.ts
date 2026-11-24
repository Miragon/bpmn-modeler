/**
 * What a built bpmn-js instance registered, read back from the module list
 * bpmn-js handed diagram-js and flattened the way the injector diagram-js
 * builds does it: `__depends__` depth first, each module once at its first
 * position, the last registration of a name wins, `__init__` entries run in
 * flattened module order.
 */
import type { ModuleDeclaration, ProviderType } from "didi";
import DiagramCoreModule from "diagram-js/lib/core";

export type DiModule = ModuleDeclaration;

type Declaration = readonly [kind: ProviderType, value: unknown, ...rest: unknown[]];

/** Tells apart values that print by their type: the text is appended to the type. */
export type ValueNames = ReadonlyMap<object, string>;

interface Registration {
    readonly provider: string;
    readonly module: string;
    /** What the injector stores as the provider: the function or the value. */
    readonly target: unknown;
    readonly kind: ProviderType;
}

export interface PinnedLine {
    readonly text: string;
    /** Names the line's position in a delta. */
    readonly label: string;
}

export interface ModuleAssembly {
    /** The module list as the injector receives it, before flattening. */
    readonly topLevel: readonly DiModule[];
    readonly modules: readonly PinnedLine[];
    /** Per DI name, in registration order: the last one wins. */
    readonly registrations: ReadonlyMap<string, readonly Registration[]>;
    readonly inits: readonly PinnedLine[];
}

export interface Override {
    readonly winner: string;
    readonly over: readonly string[];
}

export interface DidiInjector {
    /** didi's provider table: `[factory, function or value, kind]` per DI name. */
    readonly _providers: Readonly<Record<string, readonly unknown[]>>;
    readonly constructor: new (modules: DiModule[]) => { init(): void };
}

const DIDI_KEYS = new Set(["__depends__", "__init__"]);
// Rolldown renames a class whose name clashes in a chunk; which copy gets `$1` is bundler output.
// Namesakes therefore print alike: a lone provider swapped for its namesake changes no line.
const BUNDLER_SUFFIX = /\$\d+$/;
const NO_NAMES: ValueNames = new Map();

/** diagram-js prepends its config module and core module to `config.modules` (Diagram.js `createInjector`). */
export function injectorModulesOf(config: { readonly modules: readonly DiModule[] }): DiModule[] {
    return [{ config: ["value", config] }, DiagramCoreModule, ...config.modules];
}

export function flattenModules(topLevel: readonly DiModule[]): DiModule[] {
    const resolved: DiModule[] = [];
    const visit = (module: DiModule): void => {
        if (resolved.includes(module)) {
            return;
        }
        (module.__depends__ ?? []).forEach(visit);
        resolved.push(module);
    };
    topLevel.forEach(visit);
    return resolved;
}

export function assembleModules(
    topLevel: readonly DiModule[],
    names: ValueNames = NO_NAMES,
): ModuleAssembly {
    const modules = flattenModules(topLevel);
    const registrations = new Map<string, Registration[]>();
    const inits: PinnedLine[] = [];
    for (const module of modules) {
        if ("__exports__" in module || "__modules__" in module) {
            throw new Error(
                `${labelOf(module)}: private didi modules are not modelled by the pins`,
            );
        }
        const label = labelOf(module);
        for (const [name, declaration] of providerEntries(module)) {
            const list = registrations.get(name) ?? [];
            list.push({
                provider: providerIdentity(declaration, names),
                module: label,
                target: providerTarget(declaration),
                kind: declaration[0],
            });
            registrations.set(name, list);
        }
        for (const entry of module.__init__ ?? []) {
            inits.push(initLine(entry, label));
        }
    }
    return {
        topLevel,
        modules: modules.map((module) => ({
            text: moduleIdentity(module, names),
            label: labelOf(module),
        })),
        registrations,
        inits,
    };
}

/**
 * Where the assembly and the built injector disagree: a DI name only one of them
 * knows, a provider the injector stores other than the assembly's winner, the
 * order in which DI names are first registered, or the `__init__` order didi runs
 * for the same modules.
 */
export function disagreementsWithInjector(
    assembly: ModuleAssembly,
    injector: DidiInjector,
): string[] {
    const stored = providerTableOf(injector);
    const disagreements = Object.keys(stored)
        .filter((name) => !assembly.registrations.has(name))
        .map((name) => `${name}: registered, but not in the assembly`);
    for (const [name, list] of assembly.registrations) {
        const winner = list[list.length - 1];
        if (!Object.hasOwn(stored, name)) {
            disagreements.push(`${name}: in the assembly, but not registered`);
        } else if (stored[name][1] !== winner.target) {
            disagreements.push(
                `${name}: the injector stores another provider than ${winner.provider}`,
            );
        }
    }
    return [
        ...disagreements,
        ...registrationOrderDisagreements(assembly, stored),
        ...initOrderDisagreements(assembly, injector.constructor),
    ];
}

function providerTableOf(injector: DidiInjector): DidiInjector["_providers"] {
    const stored: unknown = injector._providers;
    if (typeof stored !== "object" || stored === null) {
        throw new Error("didi no longer exposes _providers");
    }
    return injector._providers;
}

// didi adds a DI name to its provider table at the first registration, as the assembly's Map does.
function registrationOrderDisagreements(
    assembly: ModuleAssembly,
    stored: DidiInjector["_providers"],
): string[] {
    const injected = Object.keys(stored).filter((name) => assembly.registrations.has(name));
    const assembled = [...assembly.registrations.keys()].filter((name) =>
        Object.hasOwn(stored, name),
    );
    return firstDifference("first registration order", assembled, injected);
}

// The provider table keeps no `__init__` order, so a fresh injector of the same class runs
// the same module graph with initializers that only record their line.
function initOrderDisagreements(
    assembly: ModuleAssembly,
    Injector: DidiInjector["constructor"],
): string[] {
    const ran: string[] = [];
    const clones = new Map<DiModule, DiModule>();
    const cloneOf = (module: DiModule): DiModule => {
        const known = clones.get(module);
        if (known) {
            return known;
        }
        const label = labelOf(module);
        const clone: DiModule = {
            __depends__: (module.__depends__ ?? []).map(cloneOf),
            __init__: (module.__init__ ?? []).map((entry) => {
                const { text } = initLine(entry, label);
                return Object.assign(() => ran.push(text), { $inject: [] });
            }),
        };
        clones.set(module, clone);
        return clone;
    };
    new Injector(assembly.topLevel.map(cloneOf)).init();
    return firstDifference(
        "__init__ order",
        assembly.inits.map(({ text }) => text),
        ran,
    );
}

function firstDifference(
    what: string,
    assembled: readonly string[],
    injected: readonly string[],
): string[] {
    const length = Math.max(assembled.length, injected.length);
    for (let index = 0; index < length; index++) {
        if (assembled[index] !== injected[index]) {
            return [
                `${what}: the assembly has ${assembled[index] ?? "nothing"} where the injector has ${injected[index] ?? "nothing"}`,
            ];
        }
    }
    return [];
}

export function winningValueOf(assembly: ModuleAssembly, name: string): unknown {
    const winner = assembly.registrations.get(name)?.at(-1);
    if (winner?.kind !== "value") {
        throw new Error(`${name}: no value provider wins this DI name`);
    }
    return winner.target;
}

export function overridesOf(assembly: ModuleAssembly): Record<string, Override> {
    const overrides: Record<string, Override> = {};
    for (const [name, list] of sortedRegistrations(assembly)) {
        if (list.length > 1) {
            const [winner, ...losers] = [...list].reverse();
            overrides[name] = {
                winner: registrationText(winner),
                over: losers.map(registrationText),
            };
        }
    }
    return overrides;
}

export function sortedRegistrations(assembly: ModuleAssembly): [string, readonly Registration[]][] {
    return [...assembly.registrations].sort(([left], [right]) => byCodeUnit(left, right));
}

export function winnerText(list: readonly Registration[]): string {
    const winner = list[list.length - 1];
    if (list.length === 1) {
        return winner.provider;
    }
    const losers = list.slice(0, -1).reverse().map(registrationText);
    return `${registrationText(winner)} ×${list.length} over ${losers.join(", ")}`;
}

// A consistent comparator returns 0 for equal strings, though today's callers sort unique keys.
export function byCodeUnit(left: string, right: string): number {
    if (left === right) {
        return 0;
    }
    return left < right ? -1 : 1;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function valueIdentity(value: unknown, names: ValueNames = NO_NAMES): string {
    if (isPlainData(value)) {
        return JSON.stringify(value, sortKeys);
    }
    if (typeof value === "function") {
        return `fn ${functionIdentity(value)}`;
    }
    if (typeof value !== "object" || value === null) {
        return typeof value;
    }
    const role = names.get(value);
    const items = role === undefined ? printedItems(value) : undefined;
    if (items) {
        const texts = items.map(([key, item]) =>
            Array.isArray(value)
                ? valueIdentity(item, names)
                : `${key}: ${valueIdentity(item, names)}`,
        );
        return Array.isArray(value) ? `[${texts.join(", ")}]` : `{${texts.join(", ")}}`;
    }
    const constructorName = Object.getPrototypeOf(value)?.constructor?.name ?? "";
    return `${constructorName.replace(BUNDLER_SUFFIX, "") || "Object"}${role ?? ""}`;
}

/**
 * An array or plain object that is not plain data but holds only leaves, such as DOM nodes
 * or callbacks, prints item by item, so the pins show which one sits where; deeper nesting
 * prints by type. A plain object's items come keyed and sorted.
 */
export function printedItems(value: unknown): [key: string, item: unknown][] | undefined {
    if (isPlainData(value)) {
        return undefined;
    }
    const entries = Array.isArray(value)
        ? value.map((item, index): [string, unknown] => [String(index), item])
        : isPlainObject(value)
          ? Object.entries(value)
                .filter(([, item]) => item !== undefined)
                .sort(([left], [right]) => byCodeUnit(left, right))
          : undefined;
    const isLeaf = (item: unknown): boolean =>
        isPlainData(item) || !(Array.isArray(item) || isPlainObject(item));
    return entries?.every(([, item]) => isLeaf(item)) ? entries : undefined;
}

function registrationText({ provider, module }: Registration): string {
    return `${provider} @${module}`;
}

function providerEntries(module: DiModule): [string, Declaration][] {
    return Object.keys(module)
        .filter((key) => !DIDI_KEYS.has(key))
        .map((key) => [key, module[key] as Declaration]);
}

function providerTarget([kind, value]: Declaration): unknown {
    return kind !== "value" && Array.isArray(value) ? value[value.length - 1] : value;
}

function providerIdentity([kind, value]: Declaration, names: ValueNames): string {
    if (kind === "value") {
        return `value(${valueIdentity(value, names)})`;
    }
    return `${kind}(${annotatedIdentity(value)})`;
}

function annotatedIdentity(value: unknown): string {
    if (Array.isArray(value)) {
        return functionIdentity(value[value.length - 1], value.slice(0, -1) as string[]);
    }
    return functionIdentity(value);
}

// Functions, DOM nodes and class instances have no stable text, so they print by type.
function isPlainData(value: unknown, ancestors: readonly object[] = []): boolean {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return true;
    }
    if (typeof value === "number") {
        return Number.isFinite(value);
    }
    if (typeof value !== "object" || ancestors.includes(value)) {
        return false;
    }
    if (!Array.isArray(value) && !isPlainObject(value)) {
        return false;
    }
    return Object.values(value).every(
        (item) =>
            (item === undefined && !Array.isArray(value)) ||
            isPlainData(item, [...ancestors, value]),
    );
}

function sortKeys(_key: string, value: unknown): unknown {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }
    return Object.fromEntries(
        Object.entries(value).sort(([left], [right]) => byCodeUnit(left, right)),
    );
}

function functionIdentity(fn: unknown, annotation?: readonly string[]): string {
    if (typeof fn !== "function") {
        return `not a function: ${valueIdentity(fn)}`;
    }
    const name = fn.name.replace(BUNDLER_SUFFIX, "");
    if (name) {
        return name;
    }
    const injected =
        annotation ??
        (fn as { $inject?: readonly string[] }).$inject ??
        parameterNames(fn.toString());
    return `<anonymous>(${injected.join(", ")})`;
}

// didi injects by parameter name, so these names survive every build that still resolves.
function parameterNames(source: string): string[] {
    const parameters = /^(?:async\s+)?(?:function\s*[^(]*)?(?:\(\s*([^)]*)\)|(\w+))/m.exec(source);
    const list = parameters?.[1] ?? parameters?.[2] ?? "";
    return list
        .split(",")
        .map((parameter) => parameter.trim())
        .filter(Boolean);
}

function initIdentity(entry: unknown): string {
    return typeof entry === "string" ? entry : `fn ${annotatedIdentity(entry)}`;
}

function initLine(entry: unknown, moduleLabel: string): PinnedLine {
    const init = initIdentity(entry);
    return { text: init === moduleLabel ? init : `${init} @${moduleLabel}`, label: init };
}

function moduleIdentity(module: DiModule, names: ValueNames): string {
    const parts = providerEntries(module).map(
        ([name, declaration]) => `${name}=${providerIdentity(declaration, names)}`,
    );
    const inits = module.__init__ ?? [];
    if (inits.length > 0) {
        parts.push(`init[${inits.map(initIdentity).join(", ")}]`);
    }
    if (parts.length === 0) {
        parts.push(`depends[${(module.__depends__ ?? []).map(labelOf).join(", ")}]`);
    }
    return parts.join(" ");
}

/**
 * Its first DI name, else its first `__init__` entry, else its last dependency, the
 * module it follows when flattened.
 */
function labelOf(module: DiModule): string {
    const [first] = providerEntries(module);
    if (first) {
        return first[0];
    }
    const [init] = module.__init__ ?? [];
    if (init !== undefined) {
        return initIdentity(init);
    }
    const dependencies = module.__depends__ ?? [];
    const last = dependencies.at(-1);
    if (!last) {
        return "[]";
    }
    return `[${dependencies.length > 1 ? "…, " : ""}${labelOf(last)}]`;
}
