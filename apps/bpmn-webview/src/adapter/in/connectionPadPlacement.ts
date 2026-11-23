import ContextPadModule from "diagram-js/lib/features/context-pad";
import { type PolylinePoint, polylineMidpoint } from "@miragon/bpmn-modeler-types";

import "./connectionPadPlacement.css";

type PadTarget<Element> = Element | readonly Element[];

interface Connection {
    readonly waypoints: readonly PolylinePoint[];
}

interface OpenPad {
    readonly target: PadTarget<object>;
    readonly html: HTMLElement;
}

interface ContextPad {
    open(target: PadTarget<object>, force: boolean): void;
}

interface Canvas {
    zoom(): number;
}

interface EventBus {
    on(
        event: "selection.changed",
        priority: number,
        listener: (event: { newSelection: readonly object[] }) => void,
    ): void;
    on(event: "contextPad.open", listener: (event: { current: OpenPad }) => void): void;
    on(event: "contextPad.close" | "canvas.viewbox.changed", listener: () => void): void;
}

// After diagram-js's own handler, which opens a pad on the single selected element.
const AFTER_CONTEXT_PAD = 500;

// diagram-js puts the pad this far right of its target, in diagram units.
const PAD_MARGIN = 8;

/**
 * Opens a selected connection's pad centred above the connection's middle,
 * where it plainly belongs to the connection; diagram-js's own sits on the
 * arrowhead, over the shape the connection points to. The pad opens for the
 * connection alone, which diagram-js places at the top right of its bounds,
 * and the offset this sets on {@link ConnectionPadPlacement.ABOVE_CONNECTION}
 * moves it from there, again on every zoom. A provider offers the same entries
 * on such a pad, through {@link ConnectionPadPlacement.elementOf}.
 */
export class ConnectionPadPlacement {
    static $inject = ["contextPad", "eventBus", "canvas"];

    /** The class of a connection's pad, which `connectionPadPlacement.css` moves by its offset. */
    static readonly ABOVE_CONNECTION = "djs-context-pad--above-connection";

    private connectionPad?: { readonly connection: Connection; readonly html: HTMLElement };

    constructor(
        private readonly contextPad: ContextPad,
        eventBus: EventBus,
        private readonly canvas: Canvas,
    ) {
        eventBus.on("selection.changed", AFTER_CONTEXT_PAD, ({ newSelection }) =>
            this.placeSelected(newSelection),
        );
        eventBus.on("contextPad.open", ({ current }) => this.followPad(current));
        eventBus.on("contextPad.close", () => (this.connectionPad = undefined));
        eventBus.on("canvas.viewbox.changed", () => this.moveConnectionPad());
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

    private followPad({ target, html }: OpenPad): void {
        const element = ConnectionPadPlacement.elementOf(target);
        const connection =
            Array.isArray(target) && element && ConnectionPadPlacement.isConnection(element)
                ? element
                : undefined;
        html.classList.toggle(ConnectionPadPlacement.ABOVE_CONNECTION, connection !== undefined);
        this.connectionPad = connection && { connection, html };
        this.moveConnectionPad();
    }

    /** Sets the offset from where diagram-js puts the pad to the connection's middle, at the zoom shown. */
    private moveConnectionPad(): void {
        if (!this.connectionPad) return;
        const { connection, html } = this.connectionPad;
        const middle = polylineMidpoint(connection.waypoints);
        const right = Math.max(...connection.waypoints.map(({ x }) => x));
        const top = Math.min(...connection.waypoints.map(({ y }) => y));
        const zoom = this.canvas.zoom();
        html.style.setProperty(
            "--connection-pad-dx",
            `${(middle.x - right - PAD_MARGIN) * zoom}px`,
        );
        html.style.setProperty("--connection-pad-dy", `${(middle.y - top) * zoom}px`);
    }

    private static isConnection(element: object): element is Connection {
        return "waypoints" in element;
    }
}

export const connectionPadPlacementModule = {
    __depends__: [ContextPadModule],
    __init__: ["connectionPadPlacement"],
    connectionPadPlacement: ["type", ConnectionPadPlacement],
};
