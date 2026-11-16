import { getBBox } from "diagram-js/lib/util/Elements";

import type { ScreenBox } from "../../domain/mergeOverlayPlacement";

/** The parts of a diagram-js element a popup at it needs to know what lies around. */
export interface NeighbourhoodElement {
    readonly id: string;
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
    readonly waypoints?: readonly { readonly x: number; readonly y: number }[];
    readonly incoming?: readonly NeighbourhoodElement[];
    readonly outgoing?: readonly NeighbourhoodElement[];
    readonly source?: NeighbourhoodElement;
    readonly target?: NeighbourhoodElement;
    readonly label?: NeighbourhoodElement;
    readonly parent?: NeighbourhoodElement;
    readonly children?: readonly NeighbourhoodElement[];
}

/** The canvas calls that place a popup on the screen. */
export interface NeighbourhoodCanvas {
    viewbox(): { readonly x: number; readonly y: number; readonly scale: number };
    getContainer(): HTMLElement;
}

/** Where `element` is on the screen, its label left out. */
export function screenBoxOf(element: NeighbourhoodElement, canvas: NeighbourhoodCanvas): ScreenBox {
    const bounds = getBBox(element as Parameters<typeof getBBox>[0]);
    const { x, y, scale } = canvas.viewbox();
    const pane = canvas.getContainer().getBoundingClientRect();
    return {
        left: pane.left + (bounds.x - x) * scale,
        top: pane.top + (bounds.y - y) * scale,
        width: bounds.width * scale,
        height: bounds.height * scale,
    };
}

/** The pane's canvas on the screen; a popup partly outside it is cut off. */
export function paneBoxOf(canvas: NeighbourhoodCanvas): ScreenBox {
    const { left, top, width, height } = canvas.getContainer().getBoundingClientRect();
    return { left, top, width, height };
}

/** The element and its own label: what a popup at it must never cover. */
export function elementWithLabel(element: NeighbourhoodElement): readonly NeighbourhoodElement[] {
    return element.label === undefined ? [element] : [element, element.label];
}

/**
 * What a decision on `element` is about besides the element: the flows into
 * and out of it, the elements at their other ends, and their labels.
 */
export function neighboursOf(element: NeighbourhoodElement): readonly NeighbourhoodElement[] {
    const flows = [...(element.incoming ?? []), ...(element.outgoing ?? [])];
    const ends = flows.flatMap((flow) =>
        [flow.source, flow.target].filter(
            (end): end is NeighbourhoodElement => end !== undefined && end !== element,
        ),
    );
    return [...flows, ...ends].flatMap(elementWithLabel);
}

/**
 * What else the diagram draws that a popup would hide: every shape with
 * nothing inside, and every label. A container is left out, as its empty
 * area hides nothing; so are flows, whose boxes reach far past their lines.
 */
export function readableShapesOf(
    elements: readonly NeighbourhoodElement[],
    except: readonly NeighbourhoodElement[],
): readonly NeighbourhoodElement[] {
    const excluded = new Set(except);
    return elements.filter(
        (element) =>
            element.parent !== undefined &&
            element.waypoints === undefined &&
            (element.children ?? []).length === 0 &&
            !excluded.has(element),
    );
}
