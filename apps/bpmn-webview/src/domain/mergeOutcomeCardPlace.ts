import { type PolylinePoint, polylineMidpoint } from "@miragon/bpmn-modeler-types";

import { flowOverlayAnchor } from "./flowOverlayAnchor";

/** A box in diagram units. */
export interface DiagramBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export type DiagramPoint = PolylinePoint;

/** The element a card is at: a shape with what hangs below it, or a flow with its label. */
export type MergeCardTarget =
    | {
          readonly kind: "shape";
          readonly box: DiagramBox;
          /** Its external label, its boundary events and their labels. */
          readonly below: readonly DiagramBox[];
      }
    | {
          readonly kind: "flow";
          readonly waypoints: readonly DiagramPoint[];
          readonly label?: DiagramBox;
      };

/** The zoom, and the card's and the open pad's size in pixels, which no zoom changes. */
export interface MergeCardView {
    readonly scale: number;
    readonly card: { readonly width: number; readonly height: number };
    readonly pad?: { readonly width: number; readonly height: number };
}

/**
 * Where the card goes, in pixels from the corner diagram-js anchors the
 * element's overlays at ({@link mergeCardAnchor}), and where along its top
 * edge its arrow points.
 */
export interface MergeCardPlace {
    readonly left: number;
    readonly top: number;
    readonly arrowLeft: number;
}

const GAP_PX = 10;

// diagram-js puts the pad this far right of the element, in pixels at zoom 1.
const PAD_MARGIN = 8;

const ARROW_INSET_PX = 16;

const SCROLL_MARGIN_PX = 16;

/**
 * The card's fixed place: below a shape, its external label and boundary
 * events, from the shape's left edge, and below the pad where the pad,
 * right of the shape, reaches lower and the card would reach under it.
 * Below a flow's label or its middle, centred, and moved left of the pad,
 * which opens above the right edge of the flow's box, where it would cover it.
 */
export function mergeOutcomeCardPlace(
    target: MergeCardTarget,
    view: MergeCardView,
): MergeCardPlace {
    return target.kind === "shape" ? belowShape(target, view) : belowFlow(target, view);
}

/** Where diagram-js anchors an element's overlays: a shape's top left corner, a flow's waypoints' box's. */
export function mergeCardAnchor(target: MergeCardTarget): DiagramPoint {
    if (target.kind === "shape") return { x: target.box.x, y: target.box.y };
    return flowOverlayAnchor(target.waypoints);
}

/**
 * How far, in pixels, to scroll the diagram up so the card placed at
 * `target` fits above the pane's bottom edge, without the element leaving
 * the pane's top.
 */
export function mergeOutcomeCardScroll(
    target: MergeCardTarget,
    card: { readonly top: number; readonly height: number },
    viewbox: { readonly y: number; readonly scale: number; readonly height: number },
): number {
    const elementTop = (mergeCardAnchor(target).y - viewbox.y) * viewbox.scale;
    const overflow = elementTop + card.top + card.height + SCROLL_MARGIN_PX - viewbox.height;
    if (overflow <= 0) return 0;
    return Math.max(0, Math.min(overflow, elementTop - SCROLL_MARGIN_PX));
}

function belowShape(
    target: Extract<MergeCardTarget, { kind: "shape" }>,
    { scale, card, pad }: MergeCardView,
): MergeCardPlace {
    const { box, below } = target;
    const origin = mergeCardAnchor(target);
    const bottom = Math.max(...[box, ...below].map(({ y, height }) => y + height - origin.y));
    let top = bottom * scale + GAP_PX;
    const padLeft = (box.width + PAD_MARGIN) * scale;
    if (pad !== undefined && padLeft < card.width) top = Math.max(top, pad.height + GAP_PX);
    return { left: 0, top, arrowLeft: arrowAt((box.width * scale) / 2, card.width) };
}

function belowFlow(
    target: Extract<MergeCardTarget, { kind: "flow" }>,
    view: MergeCardView,
): MergeCardPlace {
    const { scale } = view;
    const { waypoints, label } = target;
    const { x: originX, y: originY } = mergeCardAnchor(target);
    const anchor =
        label === undefined
            ? polylineMidpoint(waypoints)
            : { x: label.x + label.width / 2, y: label.y + label.height };
    const centre = (anchor.x - originX) * scale;
    const centred = {
        left: centre - view.card.width / 2,
        top: (anchor.y - originY) * scale + GAP_PX,
    };
    const flowRight = (Math.max(...waypoints.map(({ x }) => x)) - originX) * scale;
    const left = leftOfPad(centred, flowRight, view);
    return { left, top: centred.top, arrowLeft: arrowAt(centre - left, view.card.width) };
}

/**
 * The card's left edge, moved left of the pad where it would cover it. The pad
 * opens above the right end of the flow's box, `flowRight` in pixels from it.
 */
function leftOfPad(
    centred: { readonly left: number; readonly top: number },
    flowRight: number,
    { scale, card: { width }, pad }: MergeCardView,
): number {
    if (!pad) return centred.left;
    const padLeft = flowRight + PAD_MARGIN * scale;
    const besidePad = centred.left < padLeft + pad.width && padLeft < centred.left + width;
    const belowPad = centred.top >= pad.height;
    return besidePad && !belowPad ? padLeft - GAP_PX - width : centred.left;
}

function arrowAt(along: number, cardWidth: number): number {
    return Math.min(Math.max(along, ARROW_INSET_PX), cardWidth - ARROW_INSET_PX);
}
