import {
    type Engine,
    pluginConstructionFailureReport,
    pluginLoaderFailureReport,
    type PluginLoadReport,
    pluginLoadReport,
} from "@miragon/bpmn-modeler-types";
import type { PluginModules } from "@miragon/bpmn-modeler/plugins";
import { type BpmnPluginAsset, LogWarningCommand, ShowInfoCommand } from "@miragon/bpmn-modeler-shared";

import type { HostChannel } from "../../port/hostChannel";

/** The loaded plugins a surface factory builds its model's surface with. */
export interface SurfacePlugins {
    build<Surface>(
        engine: Engine | undefined,
        build: (modules: PluginModules) => Promise<Surface>,
    ): Promise<Surface>;
}

export const NO_PLUGINS: SurfacePlugins = {
    build: (_engine, build) => build({ additionalModules: [], moddleExtensions: {} }),
};

/**
 * Loads the loader only when there is a plugin, so a plain session never
 * fetches its chunk. Never rejects: the editor may start in View, where no
 * surface awaits the plugins yet, so a failure settles to no plugins.
 */
export async function loadSurfacePlugins(
    assets: readonly BpmnPluginAsset[],
    host: HostChannel,
): Promise<SurfacePlugins> {
    if (assets.length === 0) {
        return NO_PLUGINS;
    }
    try {
        const { buildWithPluginsOrWithout, loadPlugins } = await import(
            "@miragon/bpmn-modeler/plugins"
        );
        const loaded = await loadPlugins(assets);
        reportToHost(host, pluginLoadReport(loaded));
        return {
            build: (engine, build) =>
                buildWithPluginsOrWithout(loaded, engine, build, (error) =>
                    reportToHost(host, pluginConstructionFailureReport(error)),
                ),
        };
    } catch (error) {
        reportToHost(host, pluginLoaderFailureReport(error));
        return NO_PLUGINS;
    }
}

function reportToHost(host: HostChannel, report: PluginLoadReport): void {
    for (const logLine of report.logLines) {
        host.postMessage(new LogWarningCommand(logLine));
    }
    if (report.notice) {
        host.postMessage(new ShowInfoCommand(report.notice));
    }
}
