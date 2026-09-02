import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import OutlineModule from "bpmn-js/lib/features/outline";
import { ImportXMLError, ImportXMLResult, SaveXMLResult } from "bpmn-js/lib/BaseViewer";
import { NoModelerError, observeCanvasSize } from "@miragon/bpmn-modeler-types";
import { ThemeController } from "../theme";
import { ViewportManager } from "../viewport";
import { SelectionManager } from "../selection";
import type { ThemeMode } from "../publicApi";
import type { CoreViewerServices, ViewerOptions } from "./publicApi";

/**
 * Encapsulates one readonly bpmn-js viewer instance — the view-only analogue of
 * {@link BpmnModeler}.
 *
 * Wraps `bpmn-js/lib/NavigatedViewer` (mouse + keyboard pan/zoom, no editing)
 * plus `bpmn-js/lib/features/outline`, the one module the base viewer lacks for
 * *visible* selection/hover. Viewport and selection concerns delegate to the
 * shared {@link ViewportManager} / {@link SelectionManager}, so the same
 * `ServiceAccessor`-based managers back both the modeler and the viewer.
 *
 * Per-instance by construction: bound to its own `container`, so several viewers
 * (or a viewer beside a modeler) can coexist on a page. Use {@link createViewer}
 * as the factory. Every accessor throws {@link NoModelerError} before
 * {@link init} or after {@link destroy}.
 */
export class BpmnViewer {
    private viewer: NavigatedViewer | undefined = undefined;

    private _viewport: ViewportManager | undefined;

    private _selection: SelectionManager | undefined;

    // Per-instance theme controller, created lazily on the first setTheme.
    private themeController?: ThemeController;

    // Disposes the canvas-size observer installed by loadDiagram.
    private stopObservingSize?: () => void;

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

    /**
     * Creates and mounts the bpmn-js viewer, then wires the viewport/selection
     * managers. Async for API-stability symmetry with {@link BpmnModeler.init}.
     *
     * @internal Construction step invoked by {@link createViewer}; not part of
     *   the public handle.
     */
    async init(): Promise<void> {
        this.viewer = new NavigatedViewer({
            container: this.container,
            moddleExtensions: this.options.moddleExtensions,
            // Outline is Modeler-only upstream; it is the single addition that
            // makes selection/hover visible on the otherwise chrome-free viewer.
            additionalModules: [
                OutlineModule,
                ...((this.options.additionalModules as any[]) ?? []),
            ],
        });

        const accessor = <T>(name: string): T => this.getViewer().get<T>(name);
        this._viewport = new ViewportManager(accessor);
        this._selection = new SelectionManager(accessor);
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
            this.themeController = new ThemeController([this.container]);
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
     * theme controller, and destroys the underlying bpmn-js viewer. A destroyed
     * facade throws {@link NoModelerError} from every accessor.
     */
    destroy(): void {
        this.stopObservingSize?.();
        this.stopObservingSize = undefined;
        this.themeController?.dispose();
        this.viewer?.destroy();
        this.viewer = undefined;
        this._viewport = undefined;
        this._selection = undefined;
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
