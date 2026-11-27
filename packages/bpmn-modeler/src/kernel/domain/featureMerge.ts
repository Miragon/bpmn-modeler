import type { BpmnFeature } from "./bpmnFeature";

/** One feature promise as `Promise.allSettled` reports it. */
export type FeatureOutcome =
    | { readonly status: "fulfilled"; readonly value: unknown }
    | { readonly status: "rejected"; readonly reason: unknown };

/** Why a plugin was left out. A plugin's failure never fails the surface. */
export interface DroppedPlugin {
    readonly feature: string;
    readonly problem: string;
}

/** A built-in that cannot be used, which fails the whole surface. */
export interface FailedFeature {
    readonly kind: "failed";
    readonly feature: string;
    readonly problem: string;
    readonly reason?: unknown;
}

export type FeatureLoad =
    | FailedFeature
    | {
          readonly kind: "loaded";
          readonly builtIns: readonly BpmnFeature[];
          readonly plugins: readonly BpmnFeature[];
          readonly droppedPlugins: readonly DroppedPlugin[];
      };

interface MergedFeatures {
    readonly kind: "merged";
    readonly modules: readonly unknown[];
    readonly moddleExtensions: Readonly<Record<string, object>>;
    readonly config: Readonly<Record<string, unknown>>;
    readonly droppedPlugins: readonly DroppedPlugin[];
}

export type FeatureMerge = FailedFeature | MergedFeatures;

export interface KernelVocabulary {
    /** The names the kernel registers on this surface, which a feature may require. */
    readonly kernelNames: readonly string[];
    /** The names only the kernel may provide. */
    readonly reservedNames: readonly string[];
}

const NOT_A_FEATURE = "is not a BpmnFeature: it needs an id and a modules array";
const DIDI_KEYS: ReadonlySet<string> = new Set([
    "__init__",
    "__depends__",
    "__exports__",
    "__modules__",
]);
// The kernel passes these to the bpmn-js constructor itself.
const RESERVED_CONFIG_KEYS: readonly string[] = [
    "container",
    "additionalModules",
    "modules",
    "moddleExtensions",
];

function isFeature(value: unknown): value is BpmnFeature {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const { id, modules } = value as Partial<BpmnFeature>;
    return typeof id === "string" && id.length > 0 && Array.isArray(modules);
}

function labelOf(value: unknown, fallback: string): string {
    const id = (value as { id?: unknown } | null)?.id;
    return typeof id === "string" && id.length > 0 ? id : fallback;
}

function reasonText(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Sorts the awaited feature promises: the first rejected or malformed built-in
 * fails the surface; a rejected or malformed plugin is dropped and named.
 */
export function settleFeatures(
    builtIns: readonly FeatureOutcome[],
    plugins: readonly FeatureOutcome[],
): FeatureLoad {
    const loadedBuiltIns: BpmnFeature[] = [];
    for (const [index, outcome] of builtIns.entries()) {
        const position = `feature #${index + 1}`;
        if (outcome.status === "rejected") {
            return {
                kind: "failed",
                feature: position,
                problem: "failed to load",
                reason: outcome.reason,
            };
        }
        if (!isFeature(outcome.value)) {
            return {
                kind: "failed",
                feature: labelOf(outcome.value, position),
                problem: NOT_A_FEATURE,
            };
        }
        loadedBuiltIns.push(outcome.value);
    }
    const loadedPlugins: BpmnFeature[] = [];
    const droppedPlugins: DroppedPlugin[] = [];
    for (const [index, outcome] of plugins.entries()) {
        const position = `plugin #${index + 1}`;
        if (outcome.status === "rejected") {
            droppedPlugins.push({
                feature: position,
                problem: `failed to load: ${reasonText(outcome.reason)}`,
            });
        } else if (isFeature(outcome.value)) {
            loadedPlugins.push(outcome.value);
        } else {
            droppedPlugins.push({
                feature: labelOf(outcome.value, position),
                problem: NOT_A_FEATURE,
            });
        }
    }
    return { kind: "loaded", builtIns: loadedBuiltIns, plugins: loadedPlugins, droppedPlugins };
}

function providedNames(modules: readonly unknown[], seen = new Set<unknown>()): string[] {
    return modules.flatMap((module) => {
        if (typeof module !== "object" || module === null || seen.has(module)) {
            return [];
        }
        seen.add(module);
        const own = Object.keys(module).filter((key) => !DIDI_KEYS.has(key));
        const dependencies = (module as { __depends__?: unknown }).__depends__;
        return [...providedNames(Array.isArray(dependencies) ? dependencies : [], seen), ...own];
    });
}

/** A moddle package's prefix, or the key it is listed under when it names none. */
export function moddlePrefixOf(key: string, extension: object): string {
    const prefix = (extension as { prefix?: unknown }).prefix;
    return typeof prefix === "string" ? prefix : key;
}

function moddlePrefixes(feature: BpmnFeature): string[] {
    return Object.entries(feature.moddleExtensions ?? {}).map(([key, extension]) =>
        moddlePrefixOf(key, extension),
    );
}

/** What makes a feature unusable on its own: the first problem, or `undefined`. */
function ownProblem(feature: BpmnFeature, reservedNames: readonly string[]): string | undefined {
    const reserved = providedNames(feature.modules).find((name) => reservedNames.includes(name));
    if (reserved !== undefined) {
        return `provides "${reserved}", which the kernel owns`;
    }
    const configKey = Object.keys(feature.config ?? {}).find((key) =>
        RESERVED_CONFIG_KEYS.includes(key),
    );
    return configKey === undefined
        ? undefined
        : `sets config "${configKey}", which the kernel owns`;
}

function missingRequirement(
    feature: BpmnFeature,
    provided: ReadonlySet<string>,
): string | undefined {
    const missing = (feature.requires ?? []).find((name) => !provided.has(name));
    return missing === undefined ? undefined : `requires "${missing}", which no feature provides`;
}

function namesOf(features: readonly BpmnFeature[], kernelNames: readonly string[]): Set<string> {
    return new Set([...kernelNames, ...features.flatMap(({ modules }) => providedNames(modules))]);
}

function builtInProblem(
    builtIns: readonly BpmnFeature[],
    { kernelNames, reservedNames }: KernelVocabulary,
): FailedFeature | undefined {
    const provided = namesOf(builtIns, kernelNames);
    for (const feature of builtIns) {
        const problem = ownProblem(feature, reservedNames) ?? missingRequirement(feature, provided);
        if (problem !== undefined) {
            return { kind: "failed", feature: feature.id, problem };
        }
    }
    return undefined;
}

function moddleClash(
    plugin: BpmnFeature,
    builtInPrefixes: ReadonlyMap<string, string>,
): string | undefined {
    const prefix = moddlePrefixes(plugin).find((candidate) => builtInPrefixes.has(candidate));
    return prefix === undefined
        ? undefined
        : `replaces the moddle prefix "${prefix}" of the built-in "${builtInPrefixes.get(prefix)}"`;
}

// Dropping one plugin can take away a name another plugin required, so repeat until stable.
function keptPlugins(
    builtIns: readonly BpmnFeature[],
    plugins: readonly BpmnFeature[],
    vocabulary: KernelVocabulary,
): { kept: BpmnFeature[]; dropped: DroppedPlugin[] } {
    const builtInPrefixes = new Map(
        builtIns.flatMap((feature) =>
            moddlePrefixes(feature).map((prefix) => [prefix, feature.id]),
        ),
    );
    const dropped: DroppedPlugin[] = [];
    let kept = plugins.filter((plugin) => {
        const problem =
            ownProblem(plugin, vocabulary.reservedNames) ?? moddleClash(plugin, builtInPrefixes);
        if (problem !== undefined) {
            dropped.push({ feature: plugin.id, problem });
        }
        return problem === undefined;
    });
    for (;;) {
        const provided = namesOf([...builtIns, ...kept], vocabulary.kernelNames);
        const next = kept.filter((plugin) => {
            const problem = missingRequirement(plugin, provided);
            if (problem !== undefined) {
                dropped.push({ feature: plugin.id, problem });
            }
            return problem === undefined;
        });
        if (next.length === kept.length) {
            return { kept, dropped };
        }
        kept = next;
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function mergeConfig(
    target: Readonly<Record<string, unknown>>,
    source: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...target };
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) {
            continue;
        }
        const current = result[key];
        result[key] =
            isPlainObject(current) && isPlainObject(value) ? mergeConfig(current, value) : value;
    }
    return result;
}

function mergeModdle(features: readonly BpmnFeature[]): Record<string, object> {
    const byPrefix: Record<string, object> = {};
    for (const feature of features) {
        for (const [key, extension] of Object.entries(feature.moddleExtensions ?? {})) {
            byPrefix[moddlePrefixOf(key, extension)] = extension;
        }
    }
    return byPrefix;
}

/**
 * Merges the built-ins in list order, then the plugins, so a plugin's provider
 * wins in didi and never the reverse. A built-in that cannot be used fails the
 * merge; a plugin that cannot be used is dropped and named.
 */
export function mergeFeatures(
    builtIns: readonly BpmnFeature[],
    plugins: readonly BpmnFeature[],
    vocabulary: KernelVocabulary,
): FeatureMerge {
    const failed = builtInProblem(builtIns, vocabulary);
    if (failed) {
        return failed;
    }
    const { kept, dropped } = keptPlugins(builtIns, plugins, vocabulary);
    const features = [...builtIns, ...kept];
    return {
        kind: "merged",
        modules: features.flatMap(({ modules }) => modules),
        moddleExtensions: mergeModdle(features),
        config: features.reduce<Record<string, unknown>>(
            (config, feature) => mergeConfig(config, feature.config ?? {}),
            {},
        ),
        droppedPlugins: dropped,
    };
}
