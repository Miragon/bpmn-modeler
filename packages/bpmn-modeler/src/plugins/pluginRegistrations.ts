import { type Engine, ENGINES } from "@miragon/bpmn-modeler-types";

/**
 * One `{ type, plugin }` entry a plugin script pushed onto `window.plugins`,
 * the contract of `camunda-modeler-plugin-helpers`.
 */
export interface PluginRegistration {
    readonly type: string;
    readonly plugin: unknown;
}

/** What one plugin script registered while it ran. */
export interface LoadedPlugin {
    readonly name: string;
    readonly registrations: readonly PluginRegistration[];
}

/** The part of the plugins a surface takes as `additionalModules` and `moddleExtensions`. */
export interface PluginModules {
    readonly additionalModules: unknown[];
    readonly moddleExtensions: Record<string, object>;
}

export function noPluginModules(): PluginModules {
    return { additionalModules: [], moddleExtensions: {} };
}

/** A registration the modeler skips, such as a React client extension. */
export interface IgnoredRegistration {
    readonly plugin: string;
    readonly type: string;
}

type RegistrationKind = "modules" | "moddleExtension";

interface RegistrationScope {
    readonly kind: RegistrationKind;
    readonly engines: readonly Engine[];
}

// Camunda names its engines by product line in the registration types.
const CAMUNDA_PRODUCT_LINE: Record<Engine, string> = { c7: "platform", c8: "cloud" };

const KIND_SUFFIX: Record<RegistrationKind, string> = {
    modules: "additionalModules",
    moddleExtension: "moddleExtension",
};

const REGISTRATION_SCOPES: ReadonlyMap<string, RegistrationScope> = new Map(
    (Object.keys(KIND_SUFFIX) as RegistrationKind[]).flatMap((kind) => [
        [`bpmn.modeler.${KIND_SUFFIX[kind]}`, { kind, engines: ENGINES }],
        ...ENGINES.map(
            (engine) =>
                [
                    `bpmn.${CAMUNDA_PRODUCT_LINE[engine]}.modeler.${KIND_SUFFIX[kind]}`,
                    { kind, engines: [engine] },
                ] as const,
        ),
    ]),
);

/**
 * An untagged model runs on no engine, so only registrations made for every
 * engine apply to it.
 */
function appliesTo(scope: RegistrationScope, engine: Engine | undefined): boolean {
    return engine === undefined
        ? ENGINES.every((each) => scope.engines.includes(each))
        : scope.engines.includes(engine);
}

function moddlePrefixOf(descriptor: unknown): string | undefined {
    const prefix = (descriptor as { prefix?: unknown } | null)?.prefix;
    return typeof prefix === "string" && prefix.length > 0 ? prefix : undefined;
}

function isUsable(registration: PluginRegistration, scope: RegistrationScope): boolean {
    return scope.kind === "modules" || moddlePrefixOf(registration.plugin) !== undefined;
}

/** The modules and moddle extensions of `plugins` that a model on `engine` gets. */
export function pluginModulesFor(
    plugins: readonly LoadedPlugin[],
    engine: Engine | undefined,
): PluginModules {
    const additionalModules: unknown[] = [];
    const moddleExtensions: Record<string, object> = {};
    for (const registration of plugins.flatMap((plugin) => plugin.registrations)) {
        const scope = REGISTRATION_SCOPES.get(registration.type);
        if (!scope || !isUsable(registration, scope) || !appliesTo(scope, engine)) {
            continue;
        }
        if (scope.kind === "modules") {
            additionalModules.push(registration.plugin);
        } else {
            moddleExtensions[moddlePrefixOf(registration.plugin)!] = registration.plugin as object;
        }
    }
    return { additionalModules, moddleExtensions };
}

export function ignoredRegistrations(plugins: readonly LoadedPlugin[]): IgnoredRegistration[] {
    return plugins.flatMap((plugin) =>
        plugin.registrations
            .filter((registration) => {
                const scope = REGISTRATION_SCOPES.get(registration.type);
                return !scope || !isUsable(registration, scope);
            })
            .map((registration) => ({ plugin: plugin.name, type: registration.type })),
    );
}
