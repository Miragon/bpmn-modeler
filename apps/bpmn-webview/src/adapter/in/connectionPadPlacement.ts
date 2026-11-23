import ContextPadModule from "diagram-js/lib/features/context-pad";

import "./connectionPadPlacement.css";

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
    on(
        event: "contextPad.open",
        listener: (event: { current: { target: PadTarget<object>; html: HTMLElement } }) => void,
    ): void;
}

// After diagram-js's own handler, which opens a pad on the single selected element.
const AFTER_CONTEXT_PAD = 500;

/**
 * Opens a selected connection's pad above the connection's right end, where
 * it covers neither shape the connection joins; diagram-js's own sits on the
 * arrowhead, over the shape the connection points to. The pad opens for the
 * connection alone, which diagram-js places at the top right of its bounds,
 * and {@link ConnectionPadPlacement.ABOVE_CONNECTION} lifts it from there. A
 * provider offers the same entries on such a pad, through
 * {@link ConnectionPadPlacement.elementOf}.
 */
export class ConnectionPadPlacement {
    static $inject = ["contextPad", "eventBus"];

    /** The class of a connection's pad, which `connectionPadPlacement.css` lifts. */
    static readonly ABOVE_CONNECTION = "djs-context-pad--above-connection";

    constructor(
        private readonly contextPad: ContextPad,
        eventBus: EventBus,
    ) {
        eventBus.on("selection.changed", AFTER_CONTEXT_PAD, ({ newSelection }) =>
            this.placeSelected(newSelection),
        );
        eventBus.on("contextPad.open", ({ current }) => this.markConnectionPad(current));
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

    private markConnectionPad({
        target,
        html,
    }: {
        target: PadTarget<object>;
        html: HTMLElement;
    }): void {
        const element = ConnectionPadPlacement.elementOf(target);
        const aboveConnection =
            Array.isArray(target) &&
            element !== undefined &&
            ConnectionPadPlacement.isConnection(element);
        html.classList.toggle(ConnectionPadPlacement.ABOVE_CONNECTION, aboveConnection);
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
