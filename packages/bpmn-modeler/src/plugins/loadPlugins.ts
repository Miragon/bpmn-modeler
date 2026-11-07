import type { Engine } from "@miragon/bpmn-modeler-types";

import {
    type IgnoredRegistration,
    ignoredRegistrations,
    type LoadedPlugin,
    type PluginModules,
    pluginModulesFor,
    type PluginRegistration,
} from "./pluginRegistrations";

/**
 * A plugin as URLs the page may load: a URL the host serves (VS Code's
 * `asWebviewUri`), a `blob:` URL (a frame with no file server), or a plain URL.
 */
export interface PluginSource {
    readonly name: string;
    /** A classic script that registers through `window.plugins`, as Camunda Modeler plugins do. */
    readonly scriptUrl: string;
    readonly styleUrl?: string;
}

export interface PluginLoadFailure {
    readonly plugin: string;
    readonly reason: string;
}

export interface LoadedPlugins {
    readonly plugins: readonly LoadedPlugin[];
    /** Plugins whose script or style failed to load or threw while it ran. */
    readonly failures: readonly PluginLoadFailure[];
    /** Registrations this modeler cannot run, such as a React client extension. */
    readonly ignored: readonly IgnoredRegistration[];
    /** What a surface for a model on `engine` (`undefined`: untagged) passes to the modeler. */
    modulesFor(engine: Engine | undefined): PluginModules;
}

type PluginWindow = Window & { plugins?: unknown };

// `window.plugins` is one page-wide array, so two loads at once would mix
// their plugins' registrations.
let loadQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs each plugin's script and collects what it registers. A plugin that
 * fails is reported and left out; the others still load. Registrations are
 * attributed by running one script at a time.
 */
export function loadPlugins(
    sources: readonly PluginSource[],
    target: Document = document,
): Promise<LoadedPlugins> {
    const load = loadQueue.then(() => loadInOrder(sources, target));
    loadQueue = load.catch(() => undefined);
    return load;
}

async function loadInOrder(
    sources: readonly PluginSource[],
    target: Document,
): Promise<LoadedPlugins> {
    const plugins: LoadedPlugin[] = [];
    const failures: PluginLoadFailure[] = [];
    for (const source of sources) {
        try {
            const registrations = await runPluginScript(source, target);
            if (source.styleUrl) {
                await appendStylesheet(source.styleUrl, target);
            }
            plugins.push({ name: source.name, registrations });
        } catch (error) {
            failures.push({ plugin: source.name, reason: reasonOf(error) });
        }
    }
    return {
        plugins,
        failures,
        ignored: ignoredRegistrations(plugins),
        modulesFor: (engine) => pluginModulesFor(plugins, engine),
    };
}

async function runPluginScript(
    source: PluginSource,
    target: Document,
): Promise<PluginRegistration[]> {
    const pluginWindow = target.defaultView as PluginWindow;
    const previousRegistry = pluginWindow.plugins;
    pluginWindow.plugins = [];
    // A script served from another origin (VS Code's resource host) reports
    // its errors as a bare "Script error." without a file name, so the first
    // error while this one script runs counts against it. Cancelling it tells
    // the page's own error forwarding that this loader reports it.
    let thrown: unknown;
    const recordError = (event: ErrorEvent) => {
        if (thrown === undefined) {
            thrown = event.error ?? new Error(event.message);
            event.preventDefault();
        }
    };
    pluginWindow.addEventListener("error", recordError);
    try {
        await appendScript(source.scriptUrl, target);
        if (thrown !== undefined) {
            throw thrown;
        }
        return registrationsIn(pluginWindow.plugins);
    } finally {
        pluginWindow.removeEventListener("error", recordError);
        pluginWindow.plugins = previousRegistry;
    }
}

function registrationsIn(registry: unknown): PluginRegistration[] {
    if (!Array.isArray(registry)) {
        return [];
    }
    return registry.filter(
        (entry): entry is PluginRegistration =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as { type?: unknown }).type === "string" &&
            (entry as { plugin?: unknown }).plugin !== undefined,
    );
}

function appendScript(url: string, target: Document): Promise<void> {
    return new Promise((resolve, reject) => {
        const script = target.createElement("script");
        script.src = url;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`its script did not load (${url})`));
        target.head.append(script);
    });
}

function appendStylesheet(url: string, target: Document): Promise<void> {
    return new Promise((resolve, reject) => {
        const link = target.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`its stylesheet did not load (${url})`));
        target.head.append(link);
    });
}

function reasonOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
