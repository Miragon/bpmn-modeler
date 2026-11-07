import type { Engine } from "@miragon/bpmn-modeler-types";
import type { PluginModules } from "@miragon/bpmn-modeler/plugins";
import { type BpmnPluginAsset, LogWarningCommand, ShowInfoCommand } from "@miragon/bpmn-modeler-shared";

import { type PluginLoadReport, pluginLoadReport } from "../../domain/pluginLoadReport";
import type { HostChannel } from "../../port/hostChannel";

/** The loaded plugins a surface factory asks for the modules of its model's engine. */
export interface SurfacePlugins {
    readonly isEmpty: boolean;
    modulesFor(engine: Engine | undefined): PluginModules;
}

export const NO_PLUGINS: SurfacePlugins = {
    isEmpty: true,
    modulesFor: () => ({ additionalModules: [], moddleExtensions: {} }),
};

/** Loads the loader only when there is a plugin, so a plain session never fetches its chunk. */
export async function loadSurfacePlugins(
    assets: readonly BpmnPluginAsset[],
    host: HostChannel,
): Promise<SurfacePlugins> {
    if (assets.length === 0) {
        return NO_PLUGINS;
    }
    const { loadPlugins } = await import("@miragon/bpmn-modeler/plugins");
    const loaded = await loadPlugins(assets);
    reportToHost(host, pluginLoadReport(loaded));
    return {
        isEmpty: loaded.plugins.length === 0,
        modulesFor: (engine) => loaded.modulesFor(engine),
    };
}

export function reportToHost(host: HostChannel, report: PluginLoadReport): void {
    for (const logLine of report.logLines) {
        host.postMessage(new LogWarningCommand(logLine));
    }
    if (report.notice) {
        host.postMessage(new ShowInfoCommand(report.notice));
    }
}
