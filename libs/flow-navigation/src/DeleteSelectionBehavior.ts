/**
 * Selects the predecessor element after a delete operation so the user
 * stays oriented on the canvas — without this, deletion clears the
 * selection and leaves the user stranded.
 *
 * Hooks into the `elements.delete` command (shared by Del/Backspace,
 * context-pad trash, and cut) at preExecute to capture the anchor while
 * incoming flows are still intact, then re-selects at postExecuted after
 * the deletion cascade has finished.
 */
import { resolveDeleteAnchor, type NavElement } from "./traversal";

// ---------------------------------------------------------------------------
// Structural service interfaces — satisfied by diagram-js at runtime,
// mocked with plain objects in tests.
// ---------------------------------------------------------------------------

interface EventBus {
    on(event: string, callback: (e: DeleteEvent) => void): void;
    on(event: string, priority: number, callback: (e: DeleteEvent) => void): void;
}

interface DeleteEvent {
    context: {
        elements: NavElement[];
        selectionAnchorId?: string;
    };
}

interface Selection {
    select(element: NavElement): void;
}

interface Canvas {
    scrollToElement(element: NavElement): void;
}

interface ElementRegistry {
    get(id: string): NavElement | undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DeleteSelectionBehavior {
    static $inject = ["eventBus", "selection", "canvas", "elementRegistry"];

    constructor(
        eventBus: EventBus,
        selection: Selection,
        canvas: Canvas,
        elementRegistry: ElementRegistry,
    ) {
        eventBus.on("commandStack.elements.delete.preExecute", (e) => {
            const anchor = resolveDeleteAnchor(e.context.elements);
            if (anchor) {
                e.context.selectionAnchorId = anchor.id;
            }
        });

        eventBus.on("commandStack.elements.delete.postExecuted", 250, (e) => {
            const anchorId = e.context.selectionAnchorId;
            if (!anchorId) return;

            const element = elementRegistry.get(anchorId);
            if (!element) return;

            selection.select(element);
            canvas.scrollToElement(element);
        });
    }
}
