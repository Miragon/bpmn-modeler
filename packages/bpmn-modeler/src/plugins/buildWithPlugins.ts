import type { Engine } from "@miragon/bpmn-modeler-types";

import type { LoadedPlugins } from "./loadPlugins";
import { noPluginModules, type PluginModules } from "./pluginRegistrations";

/**
 * Builds a surface with the plugin modules for `engine` and, when that build
 * throws or rejects, reports the error and builds again without them, so a
 * broken plugin never keeps a diagram from opening. An engine that gets no
 * plugin modules is built once, and its error is not the plugins' to report.
 */
export async function buildWithPluginsOrWithout<Surface>(
    plugins: Pick<LoadedPlugins, "modulesFor">,
    engine: Engine | undefined,
    build: (modules: PluginModules) => Surface | Promise<Surface>,
    onFallback: (error: unknown) => void,
): Promise<Surface> {
    const modules = plugins.modulesFor(engine);
    if (isEmpty(modules)) {
        return build(noPluginModules());
    }
    try {
        return await build(modules);
    } catch (error) {
        onFallback(error);
        return build(noPluginModules());
    }
}

function isEmpty({ additionalModules, moddleExtensions }: PluginModules): boolean {
    return additionalModules.length === 0 && Object.keys(moddleExtensions).length === 0;
}
