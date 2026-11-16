import OverlaysModule from "diagram-js/lib/features/overlays";
import { createButton, createElement } from "@miragon/bpmn-modeler-types";

import type { MergeOutcomeCardContent } from "../../domain/mergeOutcomeCard";
import {
    leastCoveringPlacement,
    type PlacementCandidate,
    type ScreenBox,
} from "../../domain/mergeOverlayPlacement";
import {
    elementWithLabel,
    type NeighbourhoodCanvas,
    type NeighbourhoodElement,
    neighboursOf,
    paneBoxOf,
    readableShapesOf,
    screenBoxOf,
} from "./mergeNeighbourhood";

import "./mergeOutcomeCard.css";

/** How a merge pane reaches its outcome card, once diagram-js built it. */
export interface MergeOutcomeCardConfig {
    attach(card: MergeOutcomeCard): void;
}

/** What the card's controls ask of the pane. */
export interface MergeOutcomeCardActions {
    /** Shows an element the card names. */
    readonly onSelect: (elementId: string) => void;
    /** Keeps the flows the other side removed with the element, as the host offered. */
    readonly onKeepRemovedFlows: (elementId: string) => void;
    readonly nameOf: (elementId: string) => string;
    readonly closeLabel: string;
    /** Where the element's context pad is on the screen, which the card leaves clear. */
    readonly padBox?: ScreenBox;
}

interface Canvas extends NeighbourhoodCanvas {
    addMarker(id: string, marker: string): void;
    removeMarker(id: string, marker: string): void;
}

interface ElementRegistry {
    get(id: string): unknown;
    getAll(): readonly unknown[];
}

interface Overlays {
    add(
        id: string,
        type: string,
        overlay: { position: object; html: HTMLElement; scale?: boolean | object },
    ): string;
    remove(filter: { type: string }): void;
}

const CARD_OVERLAY = "merge-outcome-card";

/** What blocks a refused decision, marked on the canvas while the card says so. */
export const MERGE_BLOCKER_MARKER = "merge-blocker";

/** Which side of the element the card is on; its arrow points from there. */
type CardSide = "below" | "above" | "left" | "right";

interface CardPlacement {
    readonly side: CardSide;
    readonly box: ScreenBox;
}

const GAP_PX = 12;

// The arrow keeps this far from the card's corners.
const ARROW_INSET_PX = 16;

const CHECK_MARK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>`;

/**
 * The outcome of the user's last decision as a card at the element it
 * concerns, on the pane the user decided on: what it pulled in, dropped or
 * opened again, or why it was refused with the blocking elements marked on
 * the canvas, and the offer to keep the flows removed with the element. It
 * goes below, above or beside the element, wherever it covers least of the
 * element's pad, its flows, their other ends and the blockers, and keeps a
 * fixed size whatever the zoom; the pane closes it on its next step or
 * selection.
 */
export class MergeOutcomeCard {
    static $inject = ["overlays", "canvas", "elementRegistry", "mergeOutcomeCardConfig"];

    private marked: readonly string[] = [];

    private shown: string | undefined;

    constructor(
        private readonly overlays: Overlays,
        private readonly canvas: Canvas,
        private readonly registry: ElementRegistry,
        config: MergeOutcomeCardConfig,
    ) {
        config.attach(this);
    }

    /** The element the card shows at, if one shows. */
    get shownAt(): string | undefined {
        return this.shown;
    }

    /** Shows the card at its element; `false`, showing nothing, where this canvas does not draw it. */
    show(content: MergeOutcomeCardContent, actions: MergeOutcomeCardActions): boolean {
        this.close();
        const element = this.registry.get(content.elementId) as NeighbourhoodElement | undefined;
        if (element === undefined) return false;
        const card = this.render(content, actions);
        // Added once where it is measured, then again where it fits.
        this.overlays.add(content.elementId, CARD_OVERLAY, {
            position: { left: 0, top: 0 },
            scale: false,
            html: card,
        });
        this.marked = content.blockers.filter((id) => this.registry.get(id) !== undefined);
        const placement = this.placementOf(element, card, actions.padBox);
        if (placement !== undefined) {
            this.overlays.remove({ type: CARD_OVERLAY });
            this.overlays.add(content.elementId, CARD_OVERLAY, {
                position: this.overlayPosition(element, placement.box),
                scale: false,
                html: card,
            });
            this.pointArrow(card, placement, screenBoxOf(element, this.canvas));
        }
        for (const id of this.marked) this.canvas.addMarker(id, MERGE_BLOCKER_MARKER);
        this.shown = content.elementId;
        return true;
    }

    close(): void {
        this.overlays.remove({ type: CARD_OVERLAY });
        for (const id of this.marked) this.canvas.removeMarker(id, MERGE_BLOCKER_MARKER);
        this.marked = [];
        this.shown = undefined;
    }

    /**
     * Where the card covers least: the element's pad and the element first,
     * then the pane's edge, then what the decision is about, then the rest
     * of the diagram. Below the element wins a tie, as the pad sits to its
     * right.
     */
    private placementOf(
        element: NeighbourhoodElement,
        card: HTMLElement,
        padBox: ScreenBox | undefined,
    ): CardPlacement | undefined {
        const { width, height } = card.getBoundingClientRect();
        if (width === 0 || height === 0) return undefined;
        const target = screenBoxOf(element, this.canvas);
        const blockers = this.marked.map((id) => this.registry.get(id) as NeighbourhoodElement);
        const keepClear = [
            ...elementWithLabel(element).map((part) => screenBoxOf(part, this.canvas)),
            ...(padBox === undefined ? [] : [padBox]),
        ];
        const around = [...neighboursOf(element), ...blockers];
        const others = readableShapesOf(this.registry.getAll() as NeighbourhoodElement[], [
            ...elementWithLabel(element),
            ...around,
        ]);
        const toScreen = (part: NeighbourhoodElement) => screenBoxOf(part, this.canvas);
        return leastCoveringPlacement(cardCandidates(target, { width, height }, padBox), {
            keepClear,
            bounds: paneBoxOf(this.canvas),
            neighbours: around.map(toScreen),
            others: others.map(toScreen),
        });
    }

    /** The overlay's position, in diagram units from the element's top left corner. */
    private overlayPosition(element: NeighbourhoodElement, box: ScreenBox) {
        const origin = screenBoxOf(element, this.canvas);
        const { scale } = this.canvas.viewbox();
        return { left: (box.left - origin.left) / scale, top: (box.top - origin.top) / scale };
    }

    private pointArrow(card: HTMLElement, placement: CardPlacement, target: ScreenBox): void {
        const { side, box } = placement;
        const vertical = side === "below" || side === "above";
        const along = vertical
            ? target.left + target.width / 2 - box.left
            : target.top + target.height / 2 - box.top;
        const length = vertical ? box.width : box.height;
        const clamped = Math.min(Math.max(along, ARROW_INSET_PX), length - ARROW_INSET_PX);
        card.dataset.side = side;
        card.style.setProperty("--merge-card-arrow", `${Math.round(clamped)}px`);
    }

    private render(
        content: MergeOutcomeCardContent,
        actions: MergeOutcomeCardActions,
    ): HTMLElement {
        const tone = content.applied ? "applied" : "refused";
        const card = createElement("div", `merge-outcome-card merge-outcome-card--${tone}`);
        card.setAttribute("role", content.applied ? "status" : "alert");
        const title = createElement("span", "merge-outcome-card__title");
        if (content.applied) title.insertAdjacentHTML("afterbegin", CHECK_MARK);
        title.append(content.headline);
        const close = createButton("merge-outcome-card__close", () => this.close(), "×");
        close.setAttribute("aria-label", actions.closeLabel);
        const head = createElement("div", "merge-outcome-card__head");
        head.append(title, close);
        card.append(head);
        for (const row of content.rows) {
            const line = createElement("div", "merge-outcome-card__row");
            line.append(createElement("span", "merge-outcome-card__label", row.label));
            for (const id of row.elementIds) {
                line.append(
                    createButton(
                        "merge-outcome-card__link",
                        () => actions.onSelect(id),
                        actions.nameOf(id),
                    ),
                );
            }
            card.append(line);
        }
        if (content.reasons.length > 0) {
            const reasons = createElement("ul", "merge-outcome-card__reasons");
            reasons.append(...content.reasons.map((reason) => createElement("li", "", reason)));
            card.append(reasons);
        }
        if (content.moreReasons !== undefined) {
            card.append(createElement("div", "merge-outcome-card__more", content.moreReasons));
        }
        const { offer } = content;
        if (offer !== undefined) {
            const keep = createButton(
                "merge-outcome-card__offer",
                () => actions.onKeepRemovedFlows(offer.elementId),
                offer.text,
            );
            const row = createElement("div", "merge-outcome-card__actions");
            row.append(keep);
            card.append(row);
        }
        return card;
    }
}

/** The places a card could go, in the order the card prefers them. */
function cardCandidates(
    target: ScreenBox,
    size: { readonly width: number; readonly height: number },
    padBox: ScreenBox | undefined,
): readonly PlacementCandidate<CardPlacement>[] {
    const { width, height } = size;
    const right = target.left + target.width;
    const bottom = target.top + target.height;
    const centreX = target.left + target.width / 2 - width / 2;
    const centreY = target.top + target.height / 2 - height / 2;
    const below = bottom + GAP_PX;
    const above = target.top - GAP_PX - height;
    // Past the element's left or right edge, by as much as the arrow still reaches it.
    const reachingLeft = target.left + 2 * ARROW_INSET_PX - width;
    const reachingRight = right - 2 * ARROW_INSET_PX;
    const beyondPad = Math.max(right, padBox === undefined ? right : padBox.left + padBox.width);
    const places: readonly CardPlacement[] = [
        { side: "below", box: { left: right - width, top: below, width, height } },
        { side: "below", box: { left: centreX, top: below, width, height } },
        { side: "below", box: { left: target.left, top: below, width, height } },
        { side: "below", box: { left: reachingLeft, top: below, width, height } },
        { side: "below", box: { left: reachingRight, top: below, width, height } },
        { side: "above", box: { left: right - width, top: above, width, height } },
        { side: "above", box: { left: centreX, top: above, width, height } },
        { side: "above", box: { left: target.left, top: above, width, height } },
        { side: "above", box: { left: reachingLeft, top: above, width, height } },
        { side: "above", box: { left: reachingRight, top: above, width, height } },
        { side: "left", box: { left: target.left - GAP_PX - width, top: centreY, width, height } },
        {
            side: "left",
            box: { left: target.left - GAP_PX - width, top: bottom - height, width, height },
        },
        {
            side: "left",
            box: { left: target.left - GAP_PX - width, top: target.top, width, height },
        },
        { side: "right", box: { left: beyondPad + GAP_PX, top: centreY, width, height } },
    ];
    return places.map((placement) => ({ box: placement.box, placement }));
}

/** The merge pane's outcome card, which hands itself to `config` once the pane's canvas exists. */
export function createMergeOutcomeCardModule(config: MergeOutcomeCardConfig) {
    return {
        __depends__: [OverlaysModule],
        __init__: ["mergeOutcomeCard"],
        mergeOutcomeCard: ["type", MergeOutcomeCard],
        mergeOutcomeCardConfig: ["value", config],
    };
}
