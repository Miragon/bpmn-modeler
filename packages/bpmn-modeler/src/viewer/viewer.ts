import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import OutlineModule from "bpmn-js/lib/features/outline";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import MinimapModule from "diagram-js-minimap";
import TokenSimulationViewerModule from "bpmn-js-token-simulation/lib/viewer";
import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";
// Deep imports avoid the barrel's CSS side effects; viewer styles must stay separate from editor CSS.
import PropertiesPanelModule from "@miragon/bpmn-modeler-properties-panel/render/index";
import NeutralPropertiesProviderModule from "@miragon/bpmn-modeler-properties-panel/provider/index";
import { ModeFilterModule } from "@miragon/bpmn-modeler-properties-panel/modeFilter/ModeFilterProvider";
import { CustomGroupsModule } from "@miragon/bpmn-modeler-properties-panel/customGroups/CustomGroupsRegistry";
import { DisposableStore } from "@miragon/bpmn-modeler-types";
import type { ViewportManager } from "../viewport";
import type { SelectionManager } from "../selection";
import type { RootElementManager } from "../rootElement";
import type { ViewState } from "../viewState";
import { exportFormattedXml, exportSvg, importDiagram } from "../diagramXml";
import { SurfaceCore } from "../surfaceCore";
import type { ThemeMode } from "../publicApi";
import type { CoreViewerServices, ViewerOptions } from "./publicApi";

/**
 * An independent readonly BPMN surface with optional properties and model navigation.
 * Create it with {@link createViewer}; accessors require a live instance.
 */
export class BpmnViewer {
    private readonly core: SurfaceCore<NavigatedViewer>;

    private readonly store = new DisposableStore();

    /**
     * @param container The canvas host element (bpmn-js `container`).
     * @param options Per-instance config — see {@link ViewerOptions}.
     */
    constructor(
        private readonly container: HTMLElement,
        private readonly options: ViewerOptions,
    ) {
        const panel = options.propertiesPanel;
        this.core = new SurfaceCore(container, panel ? [container, panel.parent] : [container]);
    }

    /** Access the viewport manager after {@link init}. */
    get viewport(): ViewportManager {
        return this.core.viewport;
    }

    /** Access the selection manager after {@link init}. */
    get selection(): SelectionManager {
        return this.core.selection;
    }

    /** Access the root element manager after {@link init}. */
    get rootElement(): RootElementManager {
        return this.core.rootElement;
    }

    /**
     * Snapshots the drill-down plane, viewbox, and selection so they survive an
     * instance switch (View ↔ Design ↔ Implement) — capture here, `destroy()`,
     * create the next instance, `loadDiagram`, then {@link applyViewState}. See
     * {@link ViewState} for the plane/selection degradation rules.
     */
    captureViewState(): ViewState {
        return this.core.captureViewState();
    }

    /**
     * Re-applies a {@link captureViewState} snapshot, restoring plane, viewbox,
     * and selection in the required root → viewport → selection order.
     */
    applyViewState(state: ViewState): void {
        this.core.applyViewState(state);
    }

    /** @internal */
    async init(): Promise<void> {
        const panel = this.options.propertiesPanel;

        // bpmn-js's context pad requires modeling; use diagram-js's to preserve readonly behavior.
        const navigationPort = this.options.capabilities?.modelNavigation;
        const capModules = navigationPort
            ? [ContextPadModule, createModelNavigationModule(navigationPort)]
            : [];

        this.core.allocate(this.store, () => this.constructViewer(panel, capModules), {
            extraRoots: panel ? [panel.parent] : [],
            hasSearchPad: false,
        });
    }

    private constructViewer(
        panel: ViewerOptions["propertiesPanel"],
        capModules: unknown[],
    ): NavigatedViewer {
        return new NavigatedViewer({
            container: this.container,
            moddleExtensions: this.options.moddleExtensions,
            minimap: { open: false },
            ...(panel && {
                propertiesPanel: {
                    parent: panel.parent,
                    // Keep popups within this instance's theme scope instead of document.body.
                    feelPopupContainer: this.container,
                },
            }),
            // NavigatedViewer omits Outline, which is needed to make selection and hover visible.
            additionalModules: [
                OutlineModule,
                MinimapModule,
                // The readonly variant does not require the absent modeling service.
                TokenSimulationViewerModule,
                ...(panel
                    ? [
                          PropertiesPanelModule,
                          NeutralPropertiesProviderModule,
                          ModeFilterModule,
                          CustomGroupsModule,
                      ]
                    : []),
                ...capModules,
                ...((this.options.additionalModules as unknown[]) ?? []),
            ],
        });
    }

    async loadDiagram(xml: string): Promise<ImportXMLResult> {
        const result = await importDiagram(this.core.instance, xml);
        this.core.armInitialViewport();
        return result;
    }

    async exportDiagram(): Promise<string> {
        return exportFormattedXml(this.core.instance);
    }

    async getDiagramSvg(): Promise<string> {
        return exportSvg(this.core.instance);
    }

    /**
     * Switches the colour theme live. Toggles `data-bpmn-theme` on this
     * instance's container (the authoritative per-instance mechanism) and
     * mirrors the choice to a legacy page-global `#theme-link` when present.
     */
    setTheme(theme: ThemeMode): void {
        this.core.setTheme(this.store, theme);
    }

    /**
     * Returns a service from the viewer's DI container. The
     * {@link CoreViewerServices} names are semver-stable; every other name is an
     * unstable escape hatch.
     */
    getService<K extends keyof CoreViewerServices>(name: K): CoreViewerServices[K];
    getService<T = unknown>(name: string): T;
    getService<T = unknown>(name: string): T {
        return this.core.service<T>(name);
    }

    /**
     * Tears the instance down: disposes every registered lifecycle resource (the
     * canvas-size observer, focus features, theme controller, and the underlying
     * bpmn-js viewer) in reverse order. Idempotent.
     *
     * @see BpmnViewerHandle.destroy
     */
    destroy(): void {
        this.store.dispose();
        this.core.releaseManagers();
    }
}
