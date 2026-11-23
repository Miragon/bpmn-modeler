import { type PolylinePoint, polylineMidpoint } from "@miragon/bpmn-modeler-types/domain";

import { flowOverlayAnchor } from "./flowOverlayAnchor";

/** A box in diagram units. */
export interface DiagramBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export type DiagramPoint = PolylinePoint;

/** The zoom, and the card's and the open pad's size in pixels, which no zoom changes. */
export interface MergeCardView {
    readonly scale: number;
    readonly card: { readonly width: number; readonly height: number };
    readonly pad?: { readonly width: number; readonly height: number };
}

/**
 * Where the card goes, in pixels from the element's {@link MergeCardTarget.anchor},
 * and where along its top edge its arrow points.
 */
export interface MergeCardPlace {
    readonly left: number;
    readonly top: number;
    readonly arrowLeft: number;
}

/** The element an outcome card is at, which knows where the card goes beside it. */
export abstract class MergeCardTarget {
    protected static readonly GAP_PX = 10;

    // diagram-js puts the pad this far right of the element, in pixels at zoom 1.
    protected static readonly PAD_MARGIN = 8;

    private static readonly ARROW_INSET_PX = 16;

    private static readonly SCROLL_MARGIN_PX = 16;

    /** Where diagram-js anchors the element's overlays, which the card's place counts from. */
    abstract readonly anchor: DiagramPoint;

    /** The card's fixed place, which keeps clear of what hangs below the element and of its pad. */
    abstract placeCard(view: MergeCardView): MergeCardPlace;

    /**
     * How far, in pixels, to scroll the diagram up so the placed card fits
     * above the pane's bottom edge, without the element leaving the pane's top.
     */
    scrollToFit(
        card: { readonly top: number; readonly height: number },
        viewbox: { readonly y: number; readonly scale: number; readonly height: number },
    ): number {
        const margin = MergeCardTarget.SCROLL_MARGIN_PX;
        const elementTop = (this.anchor.y - viewbox.y) * viewbox.scale;
        const overflow = elementTop + card.top + card.height + margin - viewbox.height;
        if (overflow <= 0) return 0;
        return Math.max(0, Math.min(overflow, elementTop - margin));
    }

    /** The arrow's place along the card's top edge, kept off its rounded corners. */
    protected static arrowAt(along: number, cardWidth: number): number {
        const inset = MergeCardTarget.ARROW_INSET_PX;
        return Math.min(Math.max(along, inset), cardWidth - inset);
    }
}

/**
 * A shape: the card goes below it, its external label and boundary events,
 * from its left edge, and below the pad where the pad, right of the shape,
 * reaches lower and the card would reach under it.
 */
export class ShapeCardTarget extends MergeCardTarget {
    readonly anchor: DiagramPoint;

    constructor(
        private readonly box: DiagramBox,
        /** Its external label, its boundary events and their labels. */
        private readonly below: readonly DiagramBox[] = [],
    ) {
        super();
        this.anchor = { x: box.x, y: box.y };
    }

    placeCard({ scale, card, pad }: MergeCardView): MergeCardPlace {
        const belowAll = this.bottom() * scale + MergeCardTarget.GAP_PX;
        const belowPad =
            pad && this.reachesUnderPad(scale, card.width)
                ? pad.height + MergeCardTarget.GAP_PX
                : 0;
        return {
            left: 0,
            top: Math.max(belowAll, belowPad),
            arrowLeft: MergeCardTarget.arrowAt((this.box.width * scale) / 2, card.width),
        };
    }

    /** The lowest edge of the shape and what hangs below it, from the anchor. */
    private bottom(): number {
        return Math.max(
            ...[this.box, ...this.below].map(({ y, height }) => y + height - this.anchor.y),
        );
    }

    private reachesUnderPad(scale: number, cardWidth: number): boolean {
        return (this.box.width + MergeCardTarget.PAD_MARGIN) * scale < cardWidth;
    }
}

/**
 * A flow: the card goes below its label or its middle, centred. The flow's
 * pad opens above it, so the card never meets it there.
 */
export class FlowCardTarget extends MergeCardTarget {
    readonly anchor: DiagramPoint;

    constructor(
        private readonly waypoints: readonly DiagramPoint[],
        private readonly label?: DiagramBox,
    ) {
        super();
        this.anchor = flowOverlayAnchor(waypoints);
    }

    placeCard({ scale, card }: MergeCardView): MergeCardPlace {
        const below = this.pointBelow();
        const centre = (below.x - this.anchor.x) * scale;
        const left = centre - card.width / 2;
        return {
            left,
            top: (below.y - this.anchor.y) * scale + MergeCardTarget.GAP_PX,
            arrowLeft: MergeCardTarget.arrowAt(centre - left, card.width),
        };
    }

    /** Where the card's arrow points: below the label's middle, else the flow's middle. */
    private pointBelow(): DiagramPoint {
        const label = this.label;
        if (label === undefined) return polylineMidpoint(this.waypoints);
        return { x: label.x + label.width / 2, y: label.y + label.height };
    }
}
