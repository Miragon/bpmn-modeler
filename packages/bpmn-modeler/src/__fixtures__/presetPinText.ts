// The pin text of a built surface: its module assembly, its config by key path and its
// moddle packages, rendered as a pin file or as the delta an option makes.
import {
    assembleModules,
    byCodeUnit,
    injectorModulesOf,
    isPlainObject,
    sortedRegistrations,
    valueIdentity,
    winnerText,
    type DiModule,
    type ModuleAssembly,
    type PinnedLine,
    type ValueNames,
} from "./diModuleAssembly";

export interface SurfacePins {
    readonly assembly: ModuleAssembly;
    /** Each config leaf by key path, sorted. */
    readonly config: ReadonlyMap<string, string>;
    /** `prefix uri` per moddle package, in registration order. */
    readonly moddlePackages: readonly PinnedLine[];
}

export interface ModdlePackage {
    readonly prefix: string;
    readonly uri: string;
}

// The modules are pinned as the assembly; the moddle extensions as the packages they build.
const CONFIG_KEYS_PINNED_ELSEWHERE = new Set(["modules", "moddleExtensions"]);

/**
 * The pins of the config bpmn-js hands diagram-js. `roles` names the objects the
 * caller passed in, such as ports, so a value handed to the wrong DI name shows.
 */
export function surfacePinsOf(
    config: { readonly modules: readonly DiModule[] },
    moddlePackages: readonly ModdlePackage[],
    roles: ReadonlyMap<object, string>,
): SurfacePins {
    const topLevel = injectorModulesOf(config);
    const names: ValueNames = new Map([
        ...domNodeNumbers(config, topLevel),
        ...[...roles].map(([value, role]): [object, string] => [value, `: ${role}`]),
    ]);
    return {
        assembly: assembleModules(topLevel, names),
        config: configLeaves(config, names),
        moddlePackages: moddlePackageLines(moddlePackages),
    };
}

// The mount's nodes all print as one type, so each is numbered by its first appearance:
// config key paths in sorted order, then the registrations in sorted DI name order.
function domNodeNumbers(config: object, topLevel: readonly DiModule[]): Map<object, string> {
    const nodes: Node[] = [];
    const note = (value: unknown): void => {
        if (value instanceof Node && !nodes.includes(value)) {
            nodes.push(value);
        }
    };
    configEntries(config).forEach(([, value]) => note(value));
    for (const [, list] of sortedRegistrations(assembleModules(topLevel))) {
        list.forEach(({ target }) => note(target));
    }
    return new Map(nodes.map((node, index) => [node, `#${index + 1}`]));
}

/**
 * The config bpmn-js hands diagram-js, one leaf per key path: plain objects are
 * walked, anything else prints as a provider value does.
 */
export function configLeaves(config: object, names?: ValueNames): Map<string, string> {
    return new Map(
        configEntries(config).map(([path, value]) => [path, valueIdentity(value, names)]),
    );
}

function configEntries(config: object): [string, unknown][] {
    const leaves: [string, unknown][] = [];
    const visit = (value: unknown, path: string, ancestors: readonly object[]): void => {
        const walkable =
            isPlainObject(value) && Object.keys(value).length > 0 && !ancestors.includes(value);
        if (!walkable) {
            leaves.push([path, value]);
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
    return leaves.sort(([left], [right]) => byCodeUnit(left, right));
}

export function moddlePackageLines(packages: readonly ModdlePackage[]): PinnedLine[] {
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
