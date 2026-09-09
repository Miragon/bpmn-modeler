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
import {
    installCanvasFocusIndicator,
    NoModelerError,
    observeCanvasSize,
} from "@miragon/bpmn-modeler-types";
import { ThemeController } from "../theme";
import { ViewportManager } from "../viewport";
import { SelectionManager } from "../selection";
import { RootElementManager } from "../rootElement";
import {
    applyViewState as applyViewStateComposition,
    captureViewState as captureViewStateComposition,
    type ViewState,
} from "../viewState";
import { installKeyboardFocus } from "../keyboardFocus";
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

    private stopObservingSize?: () => void;

    private focusDisposers: Array<() => void> = [];

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
                ...((this.options.additionalModules as any[]) ?? []),
            ],
        });

        const accessor = <T>(name: string): T => this.getViewer().get<T>(name);
        this._viewport = new ViewportManager(accessor);
        this._selection = new SelectionManager(accessor);
        this._rootElement = new RootElementManager(accessor);

        this.installFocusFeatures();
    }

    private installFocusFeatures(): void {
        const canvas = this.getViewer().get<{
            getContainer(): HTMLElement;
            focus(): void;
            isFocused(): boolean;
        }>("canvas");
        const canvasContainer = canvas.getContainer();
        const eventBus = () => this.getViewer().get<any>("eventBus");
        const selection = () =>
            this.getViewer().get<{ get(): unknown[]; select(elements: null): void }>("selection");
        const panelParent = this.options.propertiesPanel?.parent;

        this.focusDisposers.push(
            installKeyboardFocus({
                roots: panelParent ? [canvasContainer, panelParent] : [canvasContainer],
                focusCanvas: () => canvas.focus(),
                isCanvasFocused: () => canvas.isFocused(),
                hasSelection: () => selection().get().length > 0,
                clearSelection: () => selection().select(null),
                isSearchPadOpen: () => false,
                closeSearchPad: () => {},
            }),
        );

        this.focusDisposers.push(
            installCanvasFocusIndicator({
                parent: canvasContainer,
                isFocused: () => canvas.isFocused(),
                onFocusChanged: (listener) =>
                    eventBus().on("canvas.focus.changed", (e: { focused: boolean }) =>
                        listener(e.focused),
                    ),
                hasSelection: () => selection().get().length > 0,
                onSelectionChanged: (listener) =>
                    eventBus().on("selection.changed", (e: { newSelection: unknown[] }) =>
                        listener(e.newSelection.length > 0),
                    ),
            }),
        );
    }

    private disposeFocusFeatures(): void {
        for (const dispose of this.focusDisposers.splice(0)) {
            dispose();
        }
    }

    async loadDiagram(xml: string): Promise<ImportXMLResult> {
        try {
            const result = await this.getViewer().importXML(xml);
            // The host may mount the container before laying it out, so the box
            // can be zero when the import lands; the fit retries until it isn't.
            this.stopObservingSize?.();
            const canvas = this.getViewer().get<any>("canvas");
            this.stopObservingSize = observeCanvasSize(canvas, canvas.getContainer(), {
                applyInitialViewport: () => this._viewport!.fitViewport(),
            });
            this._viewport!.fitViewport();
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
    getService(name: string): any {
        return this.getViewer().get(name);
    }

    /**
     * Tears the instance down: stops the canvas-size observer, disposes the
     * focus features and theme controller, and destroys the underlying bpmn-js
     * viewer. A destroyed facade throws {@link NoModelerError} from every
     * accessor.
     */
    destroy(): void {
        this.stopObservingSize?.();
        this.stopObservingSize = undefined;
        this.disposeFocusFeatures();
        this.themeController?.dispose();
        this.viewer?.destroy();
        this.viewer = undefined;
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
