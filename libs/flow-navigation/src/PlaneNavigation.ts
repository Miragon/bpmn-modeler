/**
 * bpmn-js service that wires Enter / u keyboard shortcuts to plane
 * drill-in / drill-out for collapsed subprocesses.
 *
 * Enter on a collapsed subprocess jumps into its plane and auto-selects
 * the first start event so the user can keep tabbing immediately.
 * u jumps out one level and re-selects the subprocess shape.
 * bpmn-js's drilldown machinery handles viewport centering automatically.
 */
import { resolveEntry, type NavElement } from "./traversal";

/** Local constant to avoid importing from bpmn-js (keeps the lib dependency-free). */
const PLANE_SUFFIX = "_plane";

// ---------------------------------------------------------------------------
// Structural service interfaces — satisfied by diagram-js at runtime,
// mocked with plain objects in tests.
// ---------------------------------------------------------------------------

interface Keyboard {
    addListener(listener: (ctx: { keyEvent: KeyboardEvent }) => boolean | undefined): void;
    isCmd(event: KeyboardEvent): boolean;
    isShift(event: KeyboardEvent): boolean;
}

interface Selection {
    get(): NavElement[];
    select(element: NavElement): void;
}

interface Canvas {
    getRootElement(): NavElement;
    findRoot(id: string): NavElement | undefined;
    setRootElement(root: NavElement): void;
    scrollToElement(element: NavElement): void;
}

interface ElementRegistry {
    get(id: string): NavElement | undefined;
}

interface Injector {
    get(name: string, strict: false): unknown;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PlaneNavigation {
    static $inject = ["keyboard", "selection", "canvas", "elementRegistry", "injector"];

    private readonly keyboard: Keyboard;
    private readonly selection: Selection;
    private readonly canvas: Canvas;
    private readonly elementRegistry: ElementRegistry;
    private readonly injector: Injector;

    constructor(
        keyboard: Keyboard,
        selection: Selection,
        canvas: Canvas,
        elementRegistry: ElementRegistry,
        injector: Injector,
    ) {
        this.keyboard = keyboard;
        this.selection = selection;
        this.canvas = canvas;
        this.elementRegistry = elementRegistry;
        this.injector = injector;

        keyboard.addListener((ctx) => this.handleKeyDown(ctx.keyEvent));
    }

    private handleKeyDown(event: KeyboardEvent): boolean | undefined {
        if (event.key !== "Enter" && event.key !== "u") return undefined;
        if (this.keyboard.isCmd(event) || event.altKey) return undefined;

        const directEditing = this.injector.get("directEditing", false) as {
            isActive(): boolean;
        } | null;
        if (directEditing?.isActive()) return undefined;
        const popupMenu = this.injector.get("popupMenu", false) as { isOpen(): boolean } | null;
        if (popupMenu?.isOpen()) return undefined;

        if (event.key === "Enter") {
            return this.drillIn(event);
        }
        return this.drillOut();
    }

    private drillIn(event: KeyboardEvent): boolean | undefined {
        if (this.keyboard.isShift(event)) return undefined;

        const selected = this.selection.get();
        if (selected.length !== 1) return undefined;

        const plane = this.canvas.findRoot(selected[0].id + PLANE_SUFFIX);
        if (!plane) return undefined;

        this.canvas.setRootElement(plane);
        const entry = resolveEntry(plane.children ?? [], "forward");
        if (entry) {
            this.selection.select(entry);
            this.canvas.scrollToElement(entry);
        }
        return true;
    }

    /** Walk up shape.parent to find the root of the plane the shape lives in. */
    private drillOut(): boolean | undefined {
        const rootId = this.canvas.getRootElement().id;
        if (!rootId.endsWith(PLANE_SUFFIX)) return undefined;

        const shape = this.elementRegistry.get(rootId.slice(0, -PLANE_SUFFIX.length));
        if (!shape) return undefined;

        let parentRoot: NavElement = shape;
        while (parentRoot.parent) {
            parentRoot = parentRoot.parent;
        }
        this.canvas.setRootElement(parentRoot);
        this.selection.select(shape);
        this.canvas.scrollToElement(shape);
        return true;
    }
}
