import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import OutlineModule from "bpmn-js/lib/features/outline";
import ContextPadModule from "diagram-js/lib/features/context-pad";
import MinimapModule from "diagram-js-minimap";
import TokenSimulationViewerModule from "bpmn-js-token-simulation/lib/viewer";
import { ImportXMLError, ImportXMLResult, SaveXMLResult } from "bpmn-js/lib/BaseViewer";
import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";
// Deep imports avoid the barrel's CSS side effects; viewer styles must stay separate from editor CSS.
import PropertiesPanelModule from "@miragon/bpmn-modeler-properties-panel/render/index";
import NeutralPropertiesProviderModule from "@miragon/bpmn-modeler-properties-panel/provider/index";
import { ModeFilterModule } from "@miragon/bpmn-modeler-properties-panel/modeFilter/ModeFilterProvider";
import { CustomGroupsModule } from "@miragon/bpmn-modeler-properties-panel/customGroups/CustomGroupsRegistry";
import { DisposableStore, MutableDisposable, NoModelerError } from "@miragon/bpmn-modeler-types";
import { ThemeController } from "../theme";
import { CanvasViewportManager, type ViewportManager } from "../viewport";
import { ElementSelectionManager, type SelectionManager } from "../selection";
import { CanvasRootElementManager, type RootElementManager } from "../rootElement";
import {
    applyViewState as applyViewStateComposition,
    captureViewState as captureViewStateComposition,
    type ViewState,
} from "../viewState";
import { armInitialViewportPolicy } from "../initialViewport";
import { installSurfaceFocusFeatures } from "../focusFeatures";
import type { ThemeMode } from "../publicApi";
import type { CoreViewerServices, ViewerOptions } from "./publicApi";

/**
 * An independent readonly BPMN surface with optional properties and model navigation.
 * Create it with {@link createViewer}; accessors require a live instance.
 */
export class BpmnViewer {
    private viewer: NavigatedViewer | undefined = undefined;

    private _viewport: ViewportManager | undefined;

    private _selection: SelectionManager | undefined;

    private _rootElement: RootElementManager | undefined;

    private themeController?: ThemeController;

    private readonly store = new DisposableStore();

    // Re-armed per loadDiagram, so it can't be a plain store entry.
    private readonly sizeObserver = new MutableDisposable();

    /**
     * @param container The canvas host element (bpmn-js `container`).
     * @param options Per-instance config — see {@link ViewerOptions}.
     */
    constructor(
        private readonly container: HTMLElement,
        private readonly options: ViewerOptions,
    ) {}

    /** Access the viewport manager after {@link init}. */
    get viewport(): ViewportManager {
        if (!this._viewport) {
            throw new NoModelerError();
        }
        return this._viewport;
    }

    /** Access the selection manager after {@link init}. */
    get selection(): SelectionManager {
        if (!this._selection) {
            throw new NoModelerError();
        }
        return this._selection;
    }

    /** Access the root element manager after {@link init}. */
    get rootElement(): RootElementManager {
        if (!this._rootElement) {
            throw new NoModelerError();
        }
        return this._rootElement;
    }

    /**
     * Snapshots the drill-down plane, viewbox, and selection so they survive an
     * instance switch (View ↔ Design ↔ Implement) — capture here, `destroy()`,
     * create the next instance, `loadDiagram`, then {@link applyViewState}. See
     * {@link ViewState} for the plane/selection degradation rules.
     */
    captureViewState(): ViewState {
        return captureViewStateComposition(this.viewStateManagers());
    }

    /**
     * Re-applies a {@link captureViewState} snapshot, restoring plane, viewbox,
     * and selection in the required root → viewport → selection order.
     */
    applyViewState(state: ViewState): void {
        applyViewStateComposition(this.viewStateManagers(), state);
    }

    // Accessing viewport guards initialization; all three managers share its lifecycle.
    private viewStateManagers() {
        return {
            viewport: this.viewport,
            selection: this.selection,
            rootElement: this._rootElement!,
        };
    }

    /** @internal */
    async init(): Promise<void> {
        const panel = this.options.propertiesPanel;

        // bpmn-js's context pad requires modeling; use diagram-js's to preserve readonly behavior.
        const navigationPort = this.options.capabilities?.modelNavigation;
        const capModules = navigationPort
            ? [ContextPadModule, createModelNavigationModule(navigationPort)]
            : [];

        this.allocateViewer(panel, capModules);
        this.store.add(() => {
            this.viewer?.destroy();
            this.viewer = undefined;
        });

        const accessor = <T>(name: string): T => this.getViewer().get<T>(name);
        this._viewport = new CanvasViewportManager(accessor);
        this._selection = new ElementSelectionManager(accessor);
        this._rootElement = new CanvasRootElementManager(accessor);

        this.store.add(
            installSurfaceFocusFeatures(accessor, {
                extraRoots: panel ? [panel.parent] : [],
                hasSearchPad: false,
            }),
        );
        this.store.add(() => this.sizeObserver.dispose());
    }

    private allocateViewer(panel: ViewerOptions["propertiesPanel"], capModules: unknown[]): void {
        try {
            this.viewer = new NavigatedViewer({
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
        } catch (error) {
            // A partially-constructed bpmn-js attaches `.bjs-container` with no
            // handle to destroy; clear the dedicated container before rethrowing.
            this.container.replaceChildren();
            throw error;
        }
    }

    async loadDiagram(xml: string): Promise<ImportXMLResult> {
        try {
            const result = await this.getViewer().importXML(xml);
            const canvas = this.getService("canvas");
            this.sizeObserver.set(armInitialViewportPolicy(canvas, this._viewport!));
            return result;
        } catch (error: unknown) {
            if ((error as ImportXMLError).warnings) {
                const importError = error as ImportXMLError;
                throw new Error(`${importError.message} ${importError.warnings}`, {
                    cause: error,
                });
            }
            throw error;
        }
    }

    async exportDiagram(): Promise<string> {
        const result: SaveXMLResult = await this.getViewer().saveXML({ format: true });
        if (result.xml) {
            return result.xml;
        } else if (result.error) {
            throw result.error;
        }
        throw new Error("Failed to serialise the diagram!");
    }

    async getDiagramSvg(): Promise<string> {
        const result = await this.getViewer().saveSVG();
        return result.svg;
    }

    /**
     * Switches the colour theme live. Toggles `data-bpmn-theme` on this
     * instance's container (the authoritative per-instance mechanism) and
     * mirrors the choice to a legacy page-global `#theme-link` when present.
     */
    setTheme(theme: ThemeMode): void {
        if (!this.themeController) {
            const panel = this.options.propertiesPanel;
            this.themeController = new ThemeController(
                panel ? [this.container, panel.parent] : [this.container],
            );
            this.store.add(() => this.themeController?.dispose());
        }
        this.themeController.setMode(theme);
    }

    /**
     * Returns a service from the viewer's DI container. The
     * {@link CoreViewerServices} names are semver-stable; every other name is an
     * unstable escape hatch.
     */
    getService<K extends keyof CoreViewerServices>(name: K): CoreViewerServices[K];
    getService<T = unknown>(name: string): T;
    getService<T = unknown>(name: string): T {
        return this.getViewer().get<T>(name);
    }

    /**
     * Tears the instance down: disposes every registered lifecycle resource (the
     * canvas-size observer, focus features, theme controller, and the underlying
     * bpmn-js viewer) in reverse order. Idempotent. A destroyed facade throws
     * {@link NoModelerError} from every accessor.
     */
    destroy(): void {
        this.store.dispose();
        this._viewport = undefined;
        this._selection = undefined;
        this._rootElement = undefined;
    }

    /**
     * @throws {NoModelerError} If {@link init} has not been called (or the
     *   instance was destroyed).
     */
    private getViewer(): NavigatedViewer {
        if (!this.viewer) {
            throw new NoModelerError();
        }
        return this.viewer;
    }
}
