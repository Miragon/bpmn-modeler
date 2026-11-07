import type { ClipboardOptions, ModelerCapabilities, ModelerMode } from "@miragon/bpmn-modeler";
import type { SurfaceFactories } from "@miragon/bpmn-modeler/mode";
import { LogWarningCommand, ShowInfoCommand } from "@miragon/bpmn-modeler-shared";

import type { Engine } from "@miragon/bpmn-modeler-types";
import type { PluginModules } from "@miragon/bpmn-modeler/plugins";

import { elementTemplateRejectionReport } from "../../domain/elementTemplateRejectionReport";
import type { HostModelerState } from "../../domain/hostModelerState";
import { pluginConstructionFailureReport } from "../../domain/pluginLoadReport";
import { loadDesignerModule, loadModelerModule, loadViewerModule } from "./surfaceModules";
import type { HostChannel } from "../../port/hostChannel";
import type { LintBridge } from "./lintBridge";
import { NO_PLUGINS, reportToHost, type SurfacePlugins } from "./surfacePlugins";

interface SurfaceFactoryPorts {
    propertiesPanelParent: HTMLElement;
    capabilities: ModelerCapabilities;
    extraModules: unknown[];
    /** Design and Implement only: View is a NavigatedViewer, without the modeling services plugins build on. */
    plugins?: SurfacePlugins;
    clipboard: ClipboardOptions | undefined;
    lintBridge: Pick<LintBridge, "surfaceOptions">;
    hostModelerState: Pick<
        HostModelerState,
        "settings" | "applySettingsPushedSince" | "applyFavouritesPushedSince"
    >;
    onModelerModeChanged(mode: ModelerMode): void;
}

/**
 * View builds the readonly viewer, Design on an untagged model the
 * engine-neutral designer, and Design/Implement on a tagged model one modeler
 * whose mode toggles live.
 */
export function createSurfaceFactories(
    host: HostChannel,
    ports: SurfaceFactoryPorts,
): SurfaceFactories {
    const { capabilities, extraModules, hostModelerState, propertiesPanelParent } = ports;

    function reportElementTemplateRejections(errors: readonly unknown[]): void {
        const report = elementTemplateRejectionReport(errors);
        for (const logLine of report.logLines) {
            host.postMessage(new LogWarningCommand(logLine));
        }
        if (report.notice) {
            host.postMessage(new ShowInfoCommand(report.notice));
        }
    }

    const plugins = ports.plugins ?? NO_PLUGINS;

    /**
     * Builds with the plugins and, when one breaks the construction, again
     * without them: a broken plugin must never keep a diagram from opening.
     */
    async function withPlugins<Surface>(
        engine: Engine | undefined,
        build: (modules: PluginModules) => Promise<Surface>,
    ): Promise<Surface> {
        if (plugins.isEmpty) {
            return build(NO_PLUGINS.modulesFor(engine));
        }
        try {
            return await build(plugins.modulesFor(engine));
        } catch (error) {
            reportToHost(host, pluginConstructionFailureReport(error));
            return build(NO_PLUGINS.modulesFor(engine));
        }
    }

    return {
        view: async ({ container, theme }) => {
            const { createViewer } = await loadViewerModule();
            return createViewer(container, {
                theme,
                propertiesPanel: { parent: propertiesPanelParent },
                capabilities: { modelNavigation: capabilities.modelNavigation },
                additionalModules: extraModules,
            });
        },
        design: async ({ container, theme }) => {
            const [{ createDesigner }, linting] = await Promise.all([
                loadDesignerModule(),
                ports.lintBridge.surfaceOptions(),
            ]);
            const settingsAtCreation = hostModelerState.settings;
            const designer = await withPlugins(undefined, (pluginModules) =>
                createDesigner(container, {
                    theme,
                    favouriteBpmnElements: settingsAtCreation?.favouriteBpmnElements,
                    propertiesPanel: { parent: propertiesPanelParent },
                    clipboard: ports.clipboard,
                    capabilities: {
                        modelNavigation: capabilities.modelNavigation,
                        definitionSearch: capabilities.definitionSearch,
                    },
                    additionalModules: [...extraModules, ...pluginModules.additionalModules],
                    moddleExtensions: pluginModules.moddleExtensions,
                    ...linting,
                }),
            );
            // A push during the async init only reached the previous surface.
            hostModelerState.applyFavouritesPushedSince(settingsAtCreation, designer);
            return designer;
        },
        implement: async ({ container, theme, mode, engine }) => {
            if (engine === undefined) {
                // Unreachable: the mode session routes only tagged models here,
                // and createModeler's `engine` must not be faked.
                throw new Error("implement surface requires a tagged model");
            }
            const [{ createModeler }, linting] = await Promise.all([
                loadModelerModule(),
                ports.lintBridge.surfaceOptions(),
            ]);
            const settingsAtCreation = hostModelerState.settings;
            // A tagged model keeps one instance across Design and Implement, so
            // its engine's plugins stay loaded in Design too.
            const modeler = await withPlugins(engine, (pluginModules) =>
                createModeler(container, {
                    engine,
                    mode,
                    theme,
                    settings: settingsAtCreation,
                    propertiesPanel: { parent: propertiesPanelParent },
                    additionalModules: [...extraModules, ...pluginModules.additionalModules],
                    moddleExtensions: pluginModules.moddleExtensions,
                    clipboard: ports.clipboard,
                    capabilities,
                    ...linting,
                    onWarning: (warning: string) =>
                        host.postMessage(new LogWarningCommand(warning)),
                    onElementTemplatesErrors: reportElementTemplateRejections,
                    // Redundant with the mode session's own "toggle" notification, which
                    // cannot reach the modeler's options bag; both write the same values.
                    onModeChanged: ports.onModelerModeChanged,
                    handleGlobalEscape: true,
                }),
            );
            // A push during the async init only reached the previous surface.
            hostModelerState.applySettingsPushedSince(settingsAtCreation, modeler);
            return modeler;
        },
    };
}
