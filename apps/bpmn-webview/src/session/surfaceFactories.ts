import type { ClipboardOptions, ModelerCapabilities, ModelerMode } from "@miragon/bpmn-modeler";
import type { SurfaceFactories } from "@miragon/bpmn-modeler/mode";
import { LogWarningCommand } from "@miragon/bpmn-modeler-shared";

import type { HostModelerState } from "../hostModelerState";
import { loadDesignerModule, loadModelerModule, loadViewerModule } from "../surfaceModules";
import type { HostChannel } from "./hostChannel";
import type { LintBridge } from "./lintBridge";
import type { SurfaceRequests } from "./surfaceRequests";

interface SurfaceFactoryPorts {
    propertiesPanelParent: HTMLElement;
    capabilities: ModelerCapabilities;
    extraModules: unknown[];
    clipboard: ClipboardOptions | undefined;
    lintBridge: Pick<LintBridge, "surfaceOptions">;
    hostModelerState: Pick<
        HostModelerState,
        "settings" | "applySettingsPushedSince" | "applyFavouritesPushedSince"
    >;
    reportElementTemplateErrors: SurfaceRequests["reportElementTemplateErrors"];
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
            const designer = await createDesigner(container, {
                theme,
                favouriteBpmnElements: settingsAtCreation?.favouriteBpmnElements,
                propertiesPanel: { parent: propertiesPanelParent },
                clipboard: ports.clipboard,
                capabilities: {
                    modelNavigation: capabilities.modelNavigation,
                    definitionSearch: capabilities.definitionSearch,
                },
                additionalModules: extraModules,
                ...linting,
            });
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
            const modeler = await createModeler(container, {
                engine,
                mode,
                theme,
                settings: settingsAtCreation,
                propertiesPanel: { parent: propertiesPanelParent },
                additionalModules: extraModules,
                clipboard: ports.clipboard,
                capabilities,
                ...linting,
                onWarning: (warning: string) => host.postMessage(new LogWarningCommand(warning)),
                onElementTemplatesErrors: ports.reportElementTemplateErrors,
                // Redundant with the mode session's own "toggle" notification, which
                // cannot reach the modeler's options bag; both write the same values.
                onModeChanged: ports.onModelerModeChanged,
                handleGlobalEscape: true,
            });
            // A push during the async init only reached the previous surface.
            hostModelerState.applySettingsPushedSince(settingsAtCreation, modeler);
            return modeler;
        },
    };
}
