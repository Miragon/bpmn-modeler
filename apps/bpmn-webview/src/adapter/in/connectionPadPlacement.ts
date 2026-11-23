import ContextPadModule from "diagram-js/lib/features/context-pad";

type PadTarget<Element> = Element | readonly Element[];

interface ContextPad {
    open(target: PadTarget<object>, force: boolean): void;
}

interface EventBus {
    on(
        event: "selection.changed",
        priority: number,
        listener: (event: { newSelection: readonly object[] }) => void,
    ): void;
}

// After diagram-js's own handler, which opens a pad on the single selected element.
const AFTER_CONTEXT_PAD = 500;

/**
 * Opens a selected connection's pad as a one-element pad, which diagram-js
 * places above the connection's right edge as on a shape; its own sits on the
 * arrowhead, over the shape the connection points to. A provider offers the
 * same entries on such a pad, through {@link ConnectionPadPlacement.elementOf}.
 */
export class ConnectionPadPlacement {
    static $inject = ["contextPad", "eventBus"];

    constructor(
        private readonly contextPad: ContextPad,
        eventBus: EventBus,
    ) {
        eventBus.on("selection.changed", AFTER_CONTEXT_PAD, ({ newSelection }) =>
            this.placeSelected(newSelection),
        );
    }

    /** The element a pad for one element was opened for, given as itself or alone in a list. */
    static elementOf<Element>(target: PadTarget<Element>): Element | undefined {
        if (!Array.isArray(target)) return target as Element;
        return target.length === 1 ? target[0] : undefined;
    }

    /** What to open, or ask diagram-js about, for the pad of `element`. */
    padTargetOf<Element extends object>(element: Element): PadTarget<Element> {
        return ConnectionPadPlacement.isConnection(element) ? [element] : element;
    }

    private placeSelected(selection: readonly object[]): void {
        const [only] = selection;
        if (selection.length === 1 && only && ConnectionPadPlacement.isConnection(only)) {
            this.contextPad.open([only], true);
        }
    }

    private static isConnection(element: object): boolean {
        return "waypoints" in element;
    }
}

export const connectionPadPlacementModule = {
    __depends__: [ContextPadModule],
    __init__: ["connectionPadPlacement"],
    connectionPadPlacement: ["type", ConnectionPadPlacement],
};
