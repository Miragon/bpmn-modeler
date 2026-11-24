/**
 * What a built bpmn-js instance registered, read back from the module list
 * bpmn-js handed diagram-js and flattened the way the injector diagram-js
 * builds does it: `__depends__` depth first, each module once at its first
 * position, the last registration of a name wins, `__init__` entries run in
 * flattened module order. Beside the modules: the rest of the config and the
 * moddle packages bpmn-js was built with.
 */
import DiagramCoreModule from "diagram-js/lib/core";

type Declaration = readonly [kind: string, value: unknown, ...rest: unknown[]];

export interface DiModule {
    readonly __depends__?: readonly DiModule[];
    readonly __init__?: readonly unknown[];
    readonly [key: string]: unknown;
}

interface Registration {
    readonly provider: string;
    readonly module: string;
    /** What the injector stores as the provider: the function or the value. */
    readonly target: unknown;
    readonly kind: string;
}

interface PinnedLine {
    readonly text: string;
    /** Names the line's position in a delta. */
    readonly label: string;
}

export interface ModuleAssembly {
    readonly modules: readonly PinnedLine[];
    /** Per DI name, in registration order: the last one wins. */
    readonly registrations: ReadonlyMap<string, readonly Registration[]>;
    readonly inits: readonly PinnedLine[];
}

/** Everything a preset hands bpmn-js: its modules, its config and the moddle packages. */
export interface SurfacePins {
    readonly assembly: ModuleAssembly;
    /** Each config leaf by key path, sorted. */
    readonly config: ReadonlyMap<string, string>;
    /** `prefix uri` per moddle package, in registration order. */
    readonly moddlePackages: readonly PinnedLine[];
}

export interface Override {
    readonly winner: string;
    readonly over: readonly string[];
}

const DIDI_KEYS = new Set(["__depends__", "__init__"]);
// The modules are pinned as the assembly; the moddle extensions as the packages they build.
const CONFIG_KEYS_PINNED_ELSEWHERE = new Set(["modules", "moddleExtensions"]);
// Rolldown renames a class whose name clashes in a chunk; which copy gets `$1` is bundler output.
const BUNDLER_SUFFIX = /\$\d+$/;

/** diagram-js prepends its config module and core module to `config.modules` (Diagram.js `createInjector`). */
export function injectorModulesOf(config: { readonly modules: readonly DiModule[] }): DiModule[] {
    return [{ config: ["value", config] }, DiagramCoreModule as DiModule, ...config.modules];
}

export function flattenModules(topLevel: readonly DiModule[]): DiModule[] {
    const resolved: DiModule[] = [];
    const visit = (module: DiModule): void => {
        if (resolved.includes(module)) {
            return;
        }
        (module.__depends__ ?? []).forEach(visit);
        if (!resolved.includes(module)) {
            resolved.push(module);
        }
    };
    topLevel.forEach(visit);
    return resolved;
}

export function assembleModules(topLevel: readonly DiModule[]): ModuleAssembly {
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
                provider: providerIdentity(declaration),
                module: label,
                target: providerTarget(declaration),
                kind: declaration[0],
            });
            registrations.set(name, list);
        }
        for (const entry of module.__init__ ?? []) {
            const init = initIdentity(entry);
            inits.push({ text: init === label ? init : `${init} @${label}`, label: init });
        }
    }
    return {
        modules: modules.map((module) => ({
            text: moduleIdentity(module),
            label: labelOf(module),
        })),
        registrations,
        inits,
    };
}

export interface DidiInjector {
    /** didi's provider table: `[factory, function or value, kind]` per DI name. */
    readonly _providers: Readonly<Record<string, readonly unknown[]>>;
    get(name: string): unknown;
}

/**
 * Where the assembly and the built injector disagree: a DI name only one of them
 * knows, a provider the injector stores other than the assembly's winner, or,
 * for a name registered more than once, a resolved service the winner did not make.
 */
export function disagreementsWithInjector(
    assembly: ModuleAssembly,
    injector: DidiInjector,
): string[] {
    const stored = injector._providers;
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
        } else if (list.length > 1 && !madeBy(injector.get(name), winner)) {
            disagreements.push(`${name}: resolves to a service ${winner.provider} did not make`);
        }
    }
    return disagreements;
}

function madeBy(service: unknown, { kind, target }: Registration): boolean {
    if (kind === "type") {
        return Object.getPrototypeOf(service) === (target as { prototype: unknown }).prototype;
    }
    // A factory's result carries no trace of the factory; the provider table check covers it.
    return kind === "factory" || service === target;
}

/** What a `value` provider's winning registration hands the injector. */
export function winningValueOf(assembly: ModuleAssembly, name: string): unknown {
    const winner = assembly.registrations.get(name)?.at(-1);
    if (winner?.kind !== "value") {
        throw new Error(`${name}: no value provider wins this DI name`);
    }
    return winner.target;
}

/** Every DI name registered more than once, with the provider that wins and those it replaces. */
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

/**
 * The config bpmn-js hands diagram-js, one leaf per key path: plain objects are
 * walked, anything else prints as a provider value does.
 */
export function configLeaves(config: object): Map<string, string> {
    const leaves: [string, string][] = [];
    const visit = (value: unknown, path: string, ancestors: readonly object[]): void => {
        const walkable =
            isPlainObject(value) && Object.keys(value).length > 0 && !ancestors.includes(value);
        if (!walkable) {
            leaves.push([path, valueIdentity(value)]);
            return;
        }
        for (const [key, item] of Object.entries(value)) {
            visit(item, `${path}.${key}`, [...ancestors, value]);
        }
    };
    for (const [key, value] of Object.entries(config)) {
        if (!CONFIG_KEYS_PINNED_ELSEWHERE.has(key)) {
            visit(value, key, [config]);
        }
    }
    return new Map(leaves.sort(([left], [right]) => byCodeUnit(left, right)));
}

export function moddlePackageLines(
    packages: readonly { readonly prefix: string; readonly uri: string }[],
): PinnedLine[] {
    return packages.map(({ prefix, uri }) => ({ text: `${prefix} ${uri}`, label: prefix }));
}

export function renderPins(
    title: string,
    { assembly, config, moddlePackages }: SurfacePins,
): string {
    const providers = sortedRegistrations(assembly).map(
        ([name, list]) => `${name}: ${winnerText(list)}`,
    );
    return [
        `# ${title}`,
        "",
        "## modules (registration order)",
        ...assembly.modules.map(({ text }) => text),
        "",
        "## providers (by DI name)",
        ...providers,
        "",
        "## __init__ (run order)",
        ...assembly.inits.map(({ text }) => text),
        "",
        "## config (by key path, without `modules` and `moddleExtensions`)",
        ...[...config].map(([path, value]) => `${path}: ${value}`),
        "",
        "## moddle packages (registration order)",
        ...moddlePackages.map(({ text }) => text),
        "",
    ].join("\n");
}

/** What `variant` adds (+), removes (-) or replaces (~) against `base`; empty when it changes nothing. */
export function optionDelta(base: SurfacePins, variant: SurfacePins): string[] {
    const winners = (assembly: ModuleAssembly): Map<string, string> =>
        new Map([...assembly.registrations].map(([name, list]) => [name, winnerText(list)]));
    return [
        ...section("modules", sequenceDelta(base.assembly.modules, variant.assembly.modules)),
        ...section("providers", keyedDelta(winners(base.assembly), winners(variant.assembly))),
        ...section("__init__", sequenceDelta(base.assembly.inits, variant.assembly.inits)),
        ...section("config", keyedDelta(base.config, variant.config)),
        ...section("moddle packages", sequenceDelta(base.moddlePackages, variant.moddlePackages)),
    ];
}

function section(heading: string, lines: readonly string[]): string[] {
    return lines.length === 0 ? [] : [`${heading}:`, ...lines];
}

function keyedDelta(
    before: ReadonlyMap<string, string>,
    after: ReadonlyMap<string, string>,
): string[] {
    const lines: string[] = [];
    const keys = [...new Set([...before.keys(), ...after.keys()])].sort(byCodeUnit);
    for (const key of keys) {
        const old = before.get(key);
        const current = after.get(key);
        if (old === undefined && current !== undefined) {
            lines.push(`+ ${key}: ${current}`);
        } else if (old !== undefined && current === undefined) {
            lines.push(`- ${key}: ${old}`);
        } else if (old !== current) {
            lines.push(`~ ${key}: ${old} → ${current}`);
        }
    }
    return lines;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (value === null || typeof value !== "object") {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function sortedRegistrations(assembly: ModuleAssembly): [string, readonly Registration[]][] {
    return [...assembly.registrations].sort(([left], [right]) => byCodeUnit(left, right));
}

function byCodeUnit(left: string, right: string): number {
    if (left === right) {
        return 0;
    }
    return left < right ? -1 : 1;
}

function registrationText({ provider, module }: Registration): string {
    return `${provider} @${module}`;
}

function winnerText(list: readonly Registration[]): string {
    const winner = list[list.length - 1];
    if (list.length === 1) {
        return winner.provider;
    }
    const losers = list.slice(0, -1).reverse().map(registrationText);
    return `${registrationText(winner)} ×${list.length} over ${losers.join(", ")}`;
}

/**
 * An LCS diff, so an inserted line reads as one `+` and a moved one as a `-` and a `+`.
 * A line added behind the last default is placed after the defaults, not after that
 * module, so appending a default or moving the last one leaves such a line alone.
 */
function sequenceDelta(before: readonly PinnedLine[], after: readonly PinnedLine[]): string[] {
    const common: number[][] = Array.from({ length: before.length + 1 }, () =>
        new Array<number>(after.length + 1).fill(0),
    );
    for (let i = before.length - 1; i >= 0; i--) {
        for (let j = after.length - 1; j >= 0; j--) {
            common[i][j] =
                before[i].text === after[j].text
                    ? common[i + 1][j + 1] + 1
                    : Math.max(common[i + 1][j], common[i][j + 1]);
        }
    }
    const lines: string[] = [];
    let previousIsLastDefault = false;
    const position = (j: number): string => {
        if (j === 0) {
            return "(first)";
        }
        return previousIsLastDefault ? "(after the defaults)" : `(after ${after[j - 1].label})`;
    };
    let i = 0;
    let j = 0;
    while (i < before.length || j < after.length) {
        if (i < before.length && j < after.length && before[i].text === after[j].text) {
            i++;
            j++;
            previousIsLastDefault = i === before.length;
        } else if (
            j < after.length &&
            (i === before.length || common[i][j + 1] >= common[i + 1][j])
        ) {
            lines.push(`+ ${after[j].text} ${position(j)}`);
            j++;
            previousIsLastDefault = false;
        } else {
            lines.push(`- ${before[i].text}`);
            i++;
        }
    }
    return lines;
}

function providerEntries(module: DiModule): [string, Declaration][] {
    return Object.keys(module)
        .filter((key) => !DIDI_KEYS.has(key))
        .map((key) => [key, module[key] as Declaration]);
}

function providerTarget([kind, value]: Declaration): unknown {
    return kind !== "value" && Array.isArray(value) ? value[value.length - 1] : value;
}

function providerIdentity([kind, value]: Declaration): string {
    if (kind === "value") {
        return `value(${valueIdentity(value)})`;
    }
    return `${kind}(${annotatedIdentity(value)})`;
}

function annotatedIdentity(value: unknown): string {
    if (Array.isArray(value)) {
        return functionIdentity(value[value.length - 1], value.slice(0, -1) as string[]);
    }
    return functionIdentity(value);
}

function valueIdentity(value: unknown): string {
    if (value === undefined) {
        return String(value);
    }
    if (isPlainData(value)) {
        return JSON.stringify(value, sortKeys);
    }
    if (typeof value === "function") {
        return `fn ${functionIdentity(value)}`;
    }
    if (typeof value !== "object") {
        return typeof value;
    }
    const constructorName = Object.getPrototypeOf(value)?.constructor?.name ?? "";
    return constructorName.replace(BUNDLER_SUFFIX, "") || "Object";
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

function moduleIdentity(module: DiModule): string {
    const parts = providerEntries(module).map(
        ([name, declaration]) => `${name}=${providerIdentity(declaration)}`,
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
