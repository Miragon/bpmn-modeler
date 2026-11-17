/** A box in diagram units. */
export interface DiagramBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface DiagramPoint {
    readonly x: number;
    readonly y: number;
}

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
 * Below a flow's label or its middle, centred, and moved aside, away from
 * the pad at the last waypoint, where it would cover it.
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
    const { waypoints } = target;
    return {
        x: Math.min(...waypoints.map(({ x }) => x)),
        y: Math.min(...waypoints.map(({ y }) => y)),
    };
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
    { scale, card, pad }: MergeCardView,
): MergeCardPlace {
    const { waypoints, label } = target;
    const { x: originX, y: originY } = mergeCardAnchor(target);
    const anchor =
        label === undefined
            ? middleOf(waypoints)
            : { x: label.x + label.width / 2, y: label.y + label.height };
    const centre = (anchor.x - originX) * scale;
    const top = (anchor.y - originY) * scale + GAP_PX;
    let left = centre - card.width / 2;
    const last = waypoints[waypoints.length - 1];
    if (pad !== undefined && last !== undefined) {
        const padLeft = (last.x - originX + PAD_MARGIN) * scale;
        const padTop = (last.y - originY) * scale;
        const covers =
            left < padLeft + pad.width &&
            padLeft < left + card.width &&
            top < padTop + pad.height &&
            padTop < top + card.height;
        if (covers) {
            left =
                padLeft + pad.width / 2 >= centre
                    ? padLeft - GAP_PX - card.width
                    : padLeft + pad.width + GAP_PX;
        }
    }
    return { left, top, arrowLeft: arrowAt(centre - left, card.width) };
}

/** The point halfway along a flow. */
function middleOf(waypoints: readonly DiagramPoint[]): DiagramPoint {
    const segments = waypoints.slice(1).map((to, index) => {
        const from = waypoints[index];
        return { from, to, length: Math.hypot(to.x - from.x, to.y - from.y) };
    });
    let rest = segments.reduce((sum, { length }) => sum + length, 0) / 2;
    for (const { from, to, length } of segments) {
        if (rest <= length && length > 0) {
            const share = rest / length;
            return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
        }
        rest -= length;
    }
    return waypoints[0] ?? { x: 0, y: 0 };
}

function arrowAt(along: number, cardWidth: number): number {
    return Math.min(Math.max(along, ARROW_INSET_PX), cardWidth - ARROW_INSET_PX);
}
