import { MutableDisposable } from "@miragon/bpmn-modeler-types";

import type { CoreServiceAccessor } from "./coreServices";
import { armInitialViewportPolicy } from "./initialViewport";
import { CanvasRootElementManager, type RootElementManager } from "./rootElement";
import { ElementSelectionManager, type SelectionManager } from "./selection";
import { CanvasViewportManager, type ViewportData, type ViewportManager } from "./viewport";

/**
 * A snapshot of everything about *where the user is looking* — the drill-down
 * plane, the viewbox, and the selection — captured from a live instance and
 * re-applied to another after an instance switch (View ↔ Design ↔ Implement) or
 * a destructive re-import (undo/redo host push, language switch).
 *
 * The point of a switch is to land the user back on the same plane, at the same
 * viewbox and selection, on the freshly created instance. Capture on the old
 * handle, `destroy()` it, create the new one, `loadDiagram(...)`, then apply.
 *
 * - `rootElementId` is the active canvas root (a collapsed sub-process
 *   drill-down). It is `undefined` when the canvas is on the top-level process
 *   plane: the implicit root's id is regenerated on every import, so it is never
 *   captured and applying `undefined` leaves the canvas on the top-level plane.
 * - `selectedElementIds` that no longer exist on apply are silently skipped, so
 *   a snapshot taken against a since-edited diagram still degrades gracefully.
 *   An empty captured selection restores to "nothing selected".
 */
export interface ViewState {
    viewport: ViewportData;
    rootElementId?: string;
    selectedElementIds: string[];
}

/**
 * Owns where the user looks on one bpmn-js instance across the load → initial
 * fit → drill-down fit → restore sequence. {@link DrilldownFitModule} must be
 * registered on the instance for sub-process planes to fit on first visit.
 */
export class SurfaceView {
    readonly viewport: ViewportManager;

    readonly selection: SelectionManager;

    readonly rootElement: RootElementManager;

    private readonly initialFitObserver = new MutableDisposable();

    constructor(private readonly getService: CoreServiceAccessor) {
        this.viewport = new CanvasViewportManager(getService);
        this.selection = new ElementSelectionManager(getService);
        this.rootElement = new CanvasRootElementManager(getService);
    }

    /** Arms the one-time initial fit for the diagram that was just imported. */
    diagramLoaded(): void {
        this.initialFitObserver.set(
            armInitialViewportPolicy(this.getService("canvas"), this.viewport),
        );
    }

    capture(): ViewState {
        return {
            rootElementId: this.rootElement.getRootElementId(),
            viewport: this.viewport.getViewport(),
            selectedElementIds: this.selection.getSelectedElementIds(),
        };
    }

    // Restore the root first: coordinates are plane-relative, and root.set fits or
    // centres the canvas. Applying the saved viewport afterward overrides that.
    apply(state: ViewState): void {
        this.rootElement.setRootElementById(state.rootElementId);
        this.viewport.setViewport(state.viewport);
        this.selection.selectElementsByIds(state.selectedElementIds);
    }

    dispose(): void {
        this.initialFitObserver.dispose();
    }
}

const AFTER_DRILLDOWN_CENTERING = 500;

interface PlaneRoot {
    id: string;
    businessObject?: { $instanceOf(type: string): boolean };
}

interface RootSetEventBus {
    on(
        event: string,
        priorityOrCallback: number | (() => void),
        callback?: (event: { element?: PlaneRoot }) => void,
    ): void;
}

/** Fits a sub-process plane the first time the user drills into it. */
export class DrilldownFit {
    static $inject = ["eventBus", "injector"];

    private readonly seen = new Set<string>();

    private readonly viewport: ViewportManager;

    constructor(eventBus: RootSetEventBus, injector: { get<T>(name: string): T }) {
        this.viewport = new CanvasViewportManager(<T>(name: string) => injector.get<T>(name));

        // Run after drilldown centering but before callers restore a saved viewbox.
        eventBus.on("root.set", AFTER_DRILLDOWN_CENTERING, ({ element }) =>
            this.onRootSet(element),
        );
        eventBus.on("diagram.clear", () => this.seen.clear());
    }

    private onRootSet(root: PlaneRoot | undefined): void {
        if (!root || !isSubProcessPlane(root) || this.seen.has(root.id)) {
            return;
        }
        this.seen.add(root.id);
        this.viewport.fitViewport();
    }
}

function isSubProcessPlane(root: PlaneRoot): boolean {
    const businessObject = root.businessObject;
    return (
        typeof businessObject?.$instanceOf === "function" &&
        businessObject.$instanceOf("bpmn:SubProcess")
    );
}

export const DrilldownFitModule = {
    __init__: ["drilldownFit"],
    drilldownFit: ["type", DrilldownFit],
};
