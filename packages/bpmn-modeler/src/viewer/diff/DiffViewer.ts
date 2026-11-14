import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import type { ModuleDeclaration } from "didi";
import type Canvas from "diagram-js/lib/core/Canvas";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type EventBus from "diagram-js/lib/core/EventBus";
import type { Event as EventBusEvent } from "diagram-js/lib/core/EventBus";
import type Selection from "diagram-js/lib/features/selection/Selection";
import type { Point } from "diagram-js/lib/util/Types";

import {
    DIFF_MARKERS,
    type DiffMarker,
    DIFF_SELECTED_MARKER,
    DisposableStore,
    MIN_CANVAS_SIZE_PX,
    MutableDisposable,
    NoModelerError,
    subscribe,
    Viewport,
    isUsableViewbox,
} from "@miragon/bpmn-modeler-types";

import { centreOf, type PositionedElement, viewboxCentredOn } from "../../elementGeometry";
import { armInitialViewportPolicy, InitialViewportLatch } from "../../initialViewport";
import { subscribeViewboxChanged } from "../../viewport";
import { bpmnElementIdOf, singleSelectedElementId, type BpmnDiagramElement } from "./diffSelection";
import { armKeepUserSelectionVisible, UserChangeGuard } from "./selectionPolicy";

/**
 * How a pane names the plane it opened on, so a process on one side and a
 * collaboration on the other still meet there.
 */
const OPENING_PLANE = "";

/** CSS class applied to each element category on the canvas, as `DIFF_MARKERS` maps them. */
export type DiffMarkerClass = DiffMarker;

/** Per-pane config for {@link DiffViewer}. */
export interface DiffViewerOptions {
    /**
     * Extra bpmn-js/didi modules for the pane, such as a context pad. Without
     * them the pane stays the plain readonly viewer.
     */
    additionalModules?: unknown[];
}

/**
 * Replaces diagram-js's KeepSelectionVisible: its scroll on resize would post a
 * viewport that competes with the partner pane's.
 */
const NO_KEEP_SELECTION_VISIBLE_MODULE = { keepSelectionVisible: ["value", {}] };

const DIFF_CLASSES: readonly string[] = [...Object.values(DIFF_MARKERS), DIFF_SELECTED_MARKER];

/**
 * Readonly BPMN canvas for one side of a diff view.
 *
 * Wraps `bpmn-js/lib/NavigatedViewer` so the pane supports mouse + keyboard
 * pan/zoom but not editing. A destroyed pane throws {@link NoModelerError} from
 * every member that reaches the diagram.
 */
export class DiffViewer {
    private viewer: NavigatedViewer | undefined;

    private readonly changes = new UserChangeGuard();

    /**
     * Id of the element highlighted as the stepper's focus, or `undefined`.
     * Tracked so {@link focusElement} can remove the marker from the previous
     * target before adding it to the new one. Independent of the selection.
     */
    private focusedId: string | undefined;

    private readonly store = new DisposableStore();

    // The plane the pane opened on: stepping into a collapsed subprocess leaves it.
    private openingRoot: ReturnType<Canvas["getRootElement"]> | undefined;

    // Re-armed per importXML, so it can't be a plain store entry.
    private readonly sizeObserver = new MutableDisposable();

    // Keeps its own plain fit: ViewportManager's palette-inset fit would visibly change diff panes.
    private readonly latch = new InitialViewportLatch<Viewport>({
        applyViewport: (viewport) => {
            if (!this.isPaneSized()) {
                return false;
            }
            this.applyViewbox(viewport);
            return true;
        },
        fitViewport: () => this.fitViewport(),
    });

    constructor(container: HTMLElement, options: DiffViewerOptions = {}) {
        try {
            this.viewer = new NavigatedViewer({
                container,
                additionalModules: [
                    NO_KEEP_SELECTION_VISIBLE_MODULE,
                    ...(options.additionalModules ?? []),
                ] as ModuleDeclaration[],
            });
        } catch (error) {
            // A partially-constructed bpmn-js attaches `.bjs-container` with no
            // handle to destroy; clear the dedicated container before rethrowing.
            container.replaceChildren();
            throw error;
        }
        this.store.add(() => {
            this.viewer?.destroy();
            this.viewer = undefined;
        });
        this.store.add(() => this.sizeObserver.dispose());
        this.store.add(this.onPlaneChanged(() => this.fitEnteredPlane()));
        this.store.add(
            ...armKeepUserSelectionVisible(
                {
                    eventBus: this.getViewer().get<EventBus>("eventBus"),
                    canvas: this.getCanvas(),
                    selection: this.getViewer().get<Selection>("selection"),
                },
                { changes: this.changes, isPaneSized: () => this.isPaneSized() },
            ),
        );
    }

    /**
     * bpmn-js shows a plane the user drills into from its top-left corner at
     * 100 %, where a subprocess's content often is not; fit it instead.
     */
    private fitEnteredPlane(): void {
        this.changes.positionProgrammatically(() => this.fitViewport());
    }

    async importXML(xml: string): Promise<ImportXMLResult> {
        // The import sets its own root; no plane change to report until it is done.
        this.openingRoot = undefined;
        // bpmn-js clears the diagram and sets its root; diagram-js answers both with
        // an empty selection the user never made, which would clear the partner's.
        const result = await this.changes.selectProgrammaticallyUntilDone(() =>
            this.getViewer().importXML(xml),
        );
        this.openingRoot = this.getCanvas().getRootElement();

        // Panes open side by side, so one regularly has no box yet when the
        // import lands; the fit retries until it does.
        const canvas = this.getCanvas();
        this.sizeObserver.set(
            armInitialViewportPolicy(canvas, {
                resetInitialViewportDecision: () => this.latch.reset(),
                applyInitialViewportOnce: () => this.latch.applyOnce(),
                fitViewport: () => this.fitViewport(),
            }),
        );

        return result;
    }

    /**
     * Fits the diagram into the pane; `false` if it has no usable box yet.
     * Positioned programmatically: each pane fits its own box, so a fit taken
     * while one pane is still being laid out never moves the other.
     */
    private fitViewport(): boolean {
        if (!this.isPaneSized()) {
            return false;
        }
        // diagram-js accepts the "auto" centring sentinel at runtime, but its
        // Canvas.zoom types `center` as a Point only.
        this.changes.positionProgrammatically(() =>
            this.getCanvas().zoom("fit-viewport", "auto" as unknown as Point),
        );
        return true;
    }

    private isPaneSized(): boolean {
        const { outer } = this.getCanvas().viewbox();
        return outer.width >= MIN_CANVAS_SIZE_PX && outer.height >= MIN_CANVAS_SIZE_PX;
    }

    /**
     * Applies a marker class (a {@link DiffMarkerClass}, as `DIFF_MARKERS` maps
     * each category) to each id, skipping ids absent from this canvas (the
     * partner pane may carry deliveries specific to its side).
     */
    applyHighlights(ids: readonly string[], klass: DiffMarkerClass): void {
        const canvas = this.getCanvas();
        const registry = this.getViewer().get<ElementRegistry>("elementRegistry");
        for (const id of ids) {
            if (registry.get(id)) {
                canvas.addMarker(id, klass);
            }
        }
    }

    /** Removes all diff markers (including the stepper selection) from the canvas. */
    clearHighlights(): void {
        const canvas = this.getCanvas();
        const registry = this.getViewer().get<ElementRegistry>("elementRegistry");
        registry.forEach((element: { id: string }) => {
            for (const markerClass of DIFF_CLASSES) {
                canvas.removeMarker(element.id, markerClass);
            }
        });
        this.focusedId = undefined;
    }

    getViewport(): Viewport {
        const { x, y, width, height } = this.getCanvas().viewbox();
        return { x, y, width, height };
    }

    setViewport(viewport: Viewport): void {
        if (!isUsableViewbox(viewport)) {
            return;
        }
        // Applying onto a zero-sized pane blanks it; hold the box until a delivery
        // finds the pane laid out, and let it win over the pending initial fit.
        if (!this.isPaneSized()) {
            this.latch.hold(viewport);
            return;
        }
        this.applyViewbox(viewport);
        this.latch.markDecided();
    }

    private applyViewbox(viewport: Viewport): void {
        this.changes.positionProgrammatically(() => this.getCanvas().viewbox({ ...viewport }));
    }

    /**
     * Subscribes to user-driven viewport changes; changes made during a
     * programmatic reposition are rejected (also cancelling a stale pending
     * notification) so the partner pane doesn't bounce the sync back. Returns a
     * disposer that unsubscribes and cancels the debounce.
     */
    onViewportChanged(cb: (viewport: Viewport) => void): () => void {
        return subscribeViewboxChanged<Viewport>({
            eventBus: this.getViewer().get<EventBus>("eventBus"),
            // Diff sync latency is unchanged from the hand-rolled version.
            debounceMs: 80,
            accept: () => this.changes.isUserPositioning(),
            map: ({ x, y, width, height }) => ({ x, y, width, height }),
            onChange: cb,
        });
    }

    /**
     * Centres the viewport on the element with the given id and marks it as
     * the stepper's current selection.  Returns `true` if the element was
     * found on this canvas.
     *
     * Shapes carry `x/y/width/height`; connections (sequence flows, message
     * flows, associations) carry `waypoints` instead — in that case the
     * midpoint of the waypoint bbox is used.  Without this distinction edges
     * would centre at (0, 0) and produce a visible "reset" jump.
     */
    focusElement(id: string): boolean {
        if (!this.centerOnElement(id)) {
            return false;
        }
        const canvas = this.getCanvas();
        if (this.focusedId && this.focusedId !== id) {
            canvas.removeMarker(this.focusedId, DIFF_SELECTED_MARKER);
        }
        canvas.addMarker(id, DIFF_SELECTED_MARKER);
        this.focusedId = id;
        return true;
    }

    /**
     * Fits the whole diagram into the pane without a selection, on the plane
     * and as the pane opened. A partner pane keeps its own fit.
     */
    fitDiagram(): void {
        this.clearSelectionMarker();
        this.changes.positionProgrammatically(() => {
            this.showOpeningRoot();
            this.fitViewport();
        });
    }

    private showOpeningRoot(): void {
        const canvas = this.getCanvas();
        if (this.openingRoot && canvas.getRootElement() !== this.openingRoot) {
            canvas.setRootElement(this.openingRoot);
        }
    }

    /**
     * Calls back with the id of the subprocess whose plane the user enters, by
     * drilling down or through the breadcrumbs, or {@link OPENING_PLANE} for the
     * plane the pane opened on, whatever its process or collaboration is
     * called. Planes the pane enters itself, stepping or following its
     * partner, are not reported. Every plane the user enters is fitted.
     * Returns a disposer.
     */
    onPlaneChanged(cb: (planeId: string) => void): () => void {
        const eventBus = this.getViewer().get<EventBus>("eventBus");
        const listener = (event: EventBusEvent & { element?: BpmnDiagramElement }): void => {
            if (event.element && this.openingRoot && this.changes.isUserPositioning()) {
                cb(this.planeIdOf(event.element));
            }
        };
        eventBus.on("root.set", listener);
        return () => eventBus.off("root.set", listener);
    }

    /**
     * Enters the plane `planeId` names, as {@link onPlaneChanged} reports it,
     * and fits it; `false`, leaving the plane as it is, when this version has
     * none.
     */
    showPlane(planeId: string): boolean {
        const registry = this.getViewer().get<ElementRegistry>("elementRegistry");
        const plane = registry.find(
            (element) => !element.parent && this.planeIdOf(element) === planeId,
        );
        if (!plane) {
            return false;
        }
        this.clearSelectionMarker();
        this.changes.positionProgrammatically(() => {
            this.getCanvas().setRootElement(plane);
            this.fitViewport();
        });
        return true;
    }

    /**
     * Centres the viewport on `id` without touching the selection marker.
     * Used by the diff stepper to anchor the viewport on a surviving
     * neighbour when the target id only exists on the partner pane (e.g. a
     * removed element when this is the after pane).
     *
     * The cursor-sync channel already keeps the partner pane positioned (each
     * pane independently resolves the cursor against its own registry), so
     * re-emitting via viewport-sync would race the cursor sync and overwrite
     * the partner's correctly-focused viewbox with this pane's anchor position.
     */
    centerOnElement(id: string): boolean {
        const registry = this.getViewer().get<ElementRegistry>("elementRegistry");
        const element = registry.get(id);
        if (!element) {
            return false;
        }
        const centre = centreOf(element as PositionedElement);
        if (!centre) {
            return false;
        }
        const canvas = this.getCanvas();
        const viewbox = canvas.viewbox();
        const root = canvas.findRoot(element);
        if (!root) {
            return false;
        }
        this.changes.positionProgrammatically(() => {
            if (canvas.getRootElement() !== root) {
                canvas.setRootElement(root);
            }
            canvas.viewbox(viewboxCentredOn(centre, viewbox));
        });
        return true;
    }

    /**
     * Selects the element its partner pane selected, by BPMN id, or nothing for
     * `undefined`, without telling {@link onSelectedElementChanged} listeners.
     * Returns `false`, clearing the selection instead, when the element is not
     * on the plane shown. A mirrored selection stays put when the pane resizes.
     */
    mirrorSelection(elementId: string | undefined): boolean {
        const element =
            elementId === undefined
                ? undefined
                : this.getViewer().get<ElementRegistry>("elementRegistry").get(elementId);
        const canvas = this.getCanvas();
        const shown = !!element && canvas.findRoot(element) === canvas.getRootElement();
        this.changes.selectProgrammatically(() =>
            this.getViewer()
                .get<Selection>("selection")
                .select(shown ? element : null),
        );
        return shown || elementId === undefined;
    }

    /**
     * Subscribes to the user changing the selection: the selected element's
     * BPMN id (a label as the element it labels), or `undefined` when the
     * selection is empty or holds several elements. Not reported are
     * {@link mirrorSelection}, the selection an {@link importXML} drops and a
     * selection the pane drops by entering a plane itself. Unlike `SelectionManager.onSelectionChanged`, which reports every
     * selection as diagram element ids, it names one BPMN element, so two
     * versions of a diagram can share it. Returns a disposer that unsubscribes.
     */
    onSelectedElementChanged(listener: (elementId: string | undefined) => void): () => void {
        const eventBus = this.getViewer().get<EventBus>("eventBus");
        return subscribe(
            eventBus,
            "selection.changed",
            (event: { newSelection: BpmnDiagramElement[] }) => {
                if (this.changes.isUserSelectionChange()) {
                    listener(singleSelectedElementId(event.newSelection));
                }
            },
        );
    }

    /**
     * Returns `true` when `id` is present in this pane's element registry.
     */
    hasElement(id: string): boolean {
        const registry = this.getViewer().get<ElementRegistry>("elementRegistry");
        return !!registry.get(id);
    }

    /**
     * Removes the stepper-selection marker from whatever element currently
     * carries it.  Called when the stepper lands on an id that does not exist
     * on this pane: leaving the marker on the previous element would mislead
     * the user into thinking it is still the active step.
     */
    clearSelectionMarker(): void {
        if (!this.focusedId) {
            return;
        }
        this.getCanvas().removeMarker(this.focusedId, DIFF_SELECTED_MARKER);
        this.focusedId = undefined;
    }

    /**
     * Returns `true` if the element with the given id is a connection
     * (sequence flow, message flow, association) — i.e. carries waypoints
     * instead of shape bounds.
     */
    isConnection(id: string): boolean {
        const registry = this.getViewer().get<ElementRegistry>("elementRegistry");
        const element = registry.get(id) as PositionedElement | undefined;
        return !!element && Array.isArray(element.waypoints);
    }

    /**
     * Tears the pane down: disposes the canvas-size observer and destroys the
     * underlying bpmn-js viewer (detaches its DOM and event listeners) in
     * reverse order. Idempotent; a destroyed pane throws {@link NoModelerError}.
     */
    destroy(): void {
        this.store.dispose();
        this.viewer = undefined;
    }

    private getCanvas(): Canvas {
        return this.getViewer().get<Canvas>("canvas");
    }

    private getViewer(): NavigatedViewer {
        if (!this.viewer) {
            throw new NoModelerError();
        }
        return this.viewer;
    }

    // A subprocess's plane root is `<id>_plane`; bpmnElementIdOf names the subprocess.
    private planeIdOf(root: BpmnDiagramElement): string {
        return root === this.openingRoot ? OPENING_PLANE : bpmnElementIdOf(root);
    }
}
