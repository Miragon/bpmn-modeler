import type { ClipboardOptions, ModelerCapabilities, ModelerMode } from "@miragon/bpmn-modeler";
import type { SurfaceFactories } from "@miragon/bpmn-modeler/mode";
import { LogWarningCommand, ShowInfoCommand } from "@miragon/bpmn-modeler-shared";

import { elementTemplateRejectionReport } from "../../domain/elementTemplateRejectionReport";
import { elementIdSettingsOf, type HostModelerState } from "../../domain/hostModelerState";
import { loadDesignerModule, loadModelerModule, loadViewerModule } from "./surfaceModules";
import type { HostChannel } from "../../port/hostChannel";
import type { LintBridge } from "./lintBridge";
import { NO_PLUGINS, type SurfacePlugins } from "./surfacePlugins";

interface SurfaceFactoryPorts {
    propertiesPanelParent: HTMLElement;
    capabilities: ModelerCapabilities;
    extraModules: unknown[];
    /**
     * Design and Implement only: View is a NavigatedViewer, without the modeling
     * services plugins build on. A promise, so the plugins load while the
     * surface modules do.
     */
    plugins?: Promise<SurfacePlugins>;
    clipboard: ClipboardOptions | undefined;
    lintBridge: Pick<LintBridge, "surfaceOptions">;
    hostModelerState: Pick<
        HostModelerState,
        "settings" | "applySettingsPushedSince" | "applyDesignerSettingsPushedSince"
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

    const pluginsLoaded = ports.plugins ?? Promise.resolve(NO_PLUGINS);

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
            const [{ createDesigner }, linting, plugins] = await Promise.all([
                loadDesignerModule(),
                ports.lintBridge.surfaceOptions(),
                pluginsLoaded,
            ]);
            const settingsAtCreation = hostModelerState.settings;
            const designer = await plugins.build(undefined, (pluginModules) =>
                createDesigner(container, {
                    theme,
                    favouriteBpmnElements: settingsAtCreation?.favouriteBpmnElements,
                    elementIdSettings: elementIdSettingsOf(settingsAtCreation),
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
            hostModelerState.applyDesignerSettingsPushedSince(settingsAtCreation, designer);
            return designer;
        },
        implement: async ({ container, theme, mode, engine }) => {
            if (engine === undefined) {
                // Unreachable: the mode session routes only tagged models here,
                // and createModeler's `engine` must not be faked.
                throw new Error("implement surface requires a tagged model");
            }
            const [{ createModeler }, linting, plugins] = await Promise.all([
                loadModelerModule(),
                ports.lintBridge.surfaceOptions(),
                pluginsLoaded,
            ]);
            const settingsAtCreation = hostModelerState.settings;
            // A tagged model keeps one instance across Design and Implement, so
            // its engine's plugins stay loaded in Design too.
            const modeler = await plugins.build(engine, (pluginModules) =>
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
