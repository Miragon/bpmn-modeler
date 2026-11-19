import ContextPadModule from "diagram-js/lib/features/context-pad";
import OverlaysModule from "diagram-js/lib/features/overlays";
import { createButton, createElement } from "@miragon/bpmn-modeler-types";

import {
    cardToneOf,
    type MergeCardAction,
    type MergeCardChoice,
    type MergeOutcomeCardContent,
} from "../../domain/mergeCardContent";
import {
    type DiagramBox,
    type DiagramPoint,
    type MergeCardPlace,
    type MergeCardTarget,
    mergeOutcomeCardPlace,
    mergeOutcomeCardScroll,
} from "../../domain/mergeOutcomeCardPlace";

import "./mergeOutcomeCard.css";

/** How a merge pane reaches its outcome card, once diagram-js built it. */
export interface MergeOutcomeCardConfig {
    attach(card: MergeOutcomeCard): void;
}

/** What the card's controls ask of the pane. */
export interface MergeOutcomeCardActions {
    /** Shows an element the card names. */
    readonly onSelect: (elementId: string) => void;
    /** Keeps what the other side removed with the element, as the host offered. */
    readonly onKeepRemovedWith: (elementId: string) => void;
    /** A choice the card offers, such as Edit again. */
    readonly onChoose: (action: MergeCardAction) => void;
    readonly closeLabel: string;
}

interface CardElement extends Partial<DiagramBox> {
    readonly id: string;
    readonly waypoints?: readonly DiagramPoint[];
    readonly label?: DiagramBox;
    readonly attachers?: readonly (DiagramBox & { readonly label?: DiagramBox })[];
}

interface Canvas {
    addMarker(id: string, marker: string): void;
    removeMarker(id: string, marker: string): void;
    viewbox(): {
        readonly x: number;
        readonly y: number;
        readonly scale: number;
        readonly outer: { readonly height: number };
    };
    getContainer(): HTMLElement;
    scroll(delta: { dx: number; dy: number }): void;
}

interface ElementRegistry {
    get(id: string): CardElement | undefined;
}

interface Overlays {
    add(
        id: string,
        type: string,
        overlay: { position: { left: number; top: number }; html: HTMLElement; scale: boolean },
    ): string;
    remove(filter: { type: string }): void;
}

interface EventBus {
    on(event: string, listener: () => void): void;
}

interface ContextPad {
    isOpen(target: unknown): boolean;
}

const CARD_OVERLAY = "merge-outcome-card";

/** What blocks a refused decision, marked on the canvas while the card says so. */
export const MERGE_BLOCKER_MARKER = "merge-blocker";

// The card's widest, as its stylesheet caps it; the place uses it until the card is measured.
const CARD_MAX_WIDTH_PX = 280;

const CHECK_MARK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>`;

/**
 * The outcome of a decision this pane sent, as a card below the element it
 * concerns ({@link mergeOutcomeCardPlace}), at a fixed size whatever the
 * zoom: what it pulled in, dropped or opened again, or why it was refused
 * with the blockers marked on the canvas, and the offer to keep what was
 * removed with the element. It announces each outcome once, through live
 * regions that exist before their text changes, so a screen reader reads
 * them; a card shown again announces nothing.
 */
export class MergeOutcomeCard {
    static $inject = [
        "overlays",
        "canvas",
        "elementRegistry",
        "eventBus",
        "contextPad",
        "mergeOutcomeCardConfig",
    ];

    private shown: { readonly element: CardElement; readonly html: HTMLElement } | undefined;

    private marked: readonly string[] = [];

    private readonly status = createElement("div", "merge-outcome-card__announcer");

    private readonly alert = createElement("div", "merge-outcome-card__announcer");

    constructor(
        private readonly overlays: Overlays,
        private readonly canvas: Canvas,
        private readonly registry: ElementRegistry,
        eventBus: EventBus,
        private readonly contextPad: ContextPad,
        config: MergeOutcomeCardConfig,
    ) {
        this.status.setAttribute("role", "status");
        this.alert.setAttribute("role", "alert");
        canvas.getContainer().append(this.status, this.alert);
        eventBus.on("canvas.viewbox.changed", () => this.place());
        eventBus.on("contextPad.open", () => this.place());
        config.attach(this);
    }

    /** The element the card shows at, if one shows. */
    get shownAt(): string | undefined {
        return this.shown?.element.id;
    }

    /** Shows the card at its element; `false`, showing nothing, where this canvas does not draw it. */
    show(
        content: MergeOutcomeCardContent,
        actions: MergeOutcomeCardActions,
        { announce }: { readonly announce: boolean },
    ): boolean {
        this.close();
        const element = this.registry.get(content.elementId);
        if (element === undefined) return false;
        const html = this.render(content, actions);
        this.overlays.add(content.elementId, CARD_OVERLAY, {
            position: { left: 0, top: 0 },
            scale: false,
            html,
        });
        this.shown = { element, html };
        this.marked = content.blockers.filter((id) => this.registry.get(id) !== undefined);
        this.remark();
        this.placeInPane();
        if (announce) this.announce(content);
        return true;
    }

    close(): void {
        if (this.shown === undefined) return;
        this.overlays.remove({ type: CARD_OVERLAY });
        for (const id of this.marked) this.canvas.removeMarker(id, MERGE_BLOCKER_MARKER);
        this.marked = [];
        this.shown = undefined;
    }

    /** Marks the blockers again, as a repaint of the marks may have dropped their overlays' marker. */
    remark(): void {
        for (const id of this.marked) {
            this.canvas.removeMarker(id, MERGE_BLOCKER_MARKER);
            this.canvas.addMarker(id, MERGE_BLOCKER_MARKER);
        }
    }

    private place():
        | {
              readonly target: MergeCardTarget;
              readonly place: MergeCardPlace;
              readonly height: number;
          }
        | undefined {
        if (this.shown === undefined) return undefined;
        const { element, html } = this.shown;
        const measured = html.getBoundingClientRect();
        const card = { width: measured.width || CARD_MAX_WIDTH_PX, height: measured.height };
        const pad = this.padSize(element);
        const target = targetOf(element);
        const place = mergeOutcomeCardPlace(target, {
            scale: this.canvas.viewbox().scale,
            card,
            ...(pad === undefined ? {} : { pad }),
        });
        html.style.left = `${place.left}px`;
        html.style.top = `${place.top}px`;
        html.style.setProperty("--merge-card-arrow", `${place.arrowLeft}px`);
        return { target, place, height: card.height };
    }

    private padSize(element: CardElement) {
        if (!this.contextPad.isOpen(element)) return undefined;
        const pad = this.canvas.getContainer().querySelector(".djs-context-pad");
        if (pad === null) return undefined;
        const { width, height } = pad.getBoundingClientRect();
        return { width, height };
    }

    /** Places the card and scrolls the diagram up where the card would pass the pane's bottom edge. */
    private placeInPane(): void {
        const placed = this.place();
        if (placed === undefined) return;
        const { y, scale, outer } = this.canvas.viewbox();
        const scroll = mergeOutcomeCardScroll(
            placed.target,
            { top: placed.place.top, height: placed.height },
            { y, scale, height: outer.height },
        );
        if (scroll > 0) this.canvas.scroll({ dx: 0, dy: -scroll });
    }

    private announce(content: MergeOutcomeCardContent): void {
        // A new node is announced even where the text repeats the last outcome's.
        const region = cardToneOf(content) === "refused" ? this.alert : this.status;
        region.replaceChildren(...content.announcement.map((line) => createElement("p", "", line)));
    }

    private render(
        content: MergeOutcomeCardContent,
        actions: MergeOutcomeCardActions,
    ): HTMLElement {
        const card = createElement(
            "div",
            `merge-outcome-card merge-outcome-card--${cardToneOf(content)}`,
        );
        const title = createElement("span", "merge-outcome-card__title");
        if (content.applied) title.insertAdjacentHTML("afterbegin", CHECK_MARK);
        title.append(createElement("span", "merge-outcome-card__headline", content.headline));
        const close = createButton("merge-outcome-card__close", () => this.close(), "×");
        close.setAttribute("aria-label", actions.closeLabel);
        const head = createElement("div", "merge-outcome-card__head");
        head.append(title, close);
        card.append(head);
        for (const row of content.rows) {
            const line = createElement("div", "merge-outcome-card__row");
            line.append(createElement("span", "merge-outcome-card__label", row.label));
            for (const { elementId, name } of row.links) {
                line.append(link(name, () => actions.onSelect(elementId)));
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
        const { unblocked, offer } = content;
        if (unblocked !== undefined) {
            const note = createElement("div", "merge-outcome-card__row");
            note.append(link(unblocked.text, () => actions.onSelect(unblocked.elementId)));
            card.append(note);
        }
        if (offer !== undefined) {
            const row = createElement("div", "merge-outcome-card__actions");
            row.append(
                createButton(
                    "merge-outcome-card__offer",
                    () => actions.onKeepRemovedWith(offer.elementId),
                    offer.text,
                ),
            );
            card.append(row);
        }
        if (content.choices !== undefined && content.choices.length > 0) {
            const row = createElement("div", "merge-outcome-card__actions");
            row.append(...content.choices.map((choice) => choiceButton(choice, actions)));
            card.append(row);
        }
        return card;
    }
}

function choiceButton(choice: MergeCardChoice, actions: MergeOutcomeCardActions) {
    const kind = choice.primary ? "merge-outcome-card__offer" : "merge-outcome-card__choice";
    const button = createButton(kind, () => actions.onChoose(choice.action), choice.text);
    button.dataset.choice = choice.action;
    return button;
}

function link(text: string, onClick: () => void): HTMLButtonElement {
    return createButton("merge-outcome-card__link", onClick, text);
}

function targetOf(element: CardElement): MergeCardTarget {
    const { waypoints, label } = element;
    if (waypoints !== undefined) {
        return { kind: "flow", waypoints, ...(label === undefined ? {} : { label }) };
    }
    const attachers = element.attachers ?? [];
    return {
        kind: "shape",
        box: {
            x: element.x ?? 0,
            y: element.y ?? 0,
            width: element.width ?? 0,
            height: element.height ?? 0,
        },
        below: [label, ...attachers, ...attachers.map((attacher) => attacher.label)].filter(
            (box): box is DiagramBox => box !== undefined,
        ),
    };
}

/** The merge pane's outcome card, which hands itself to `config` once the pane's canvas exists. */
export function createMergeOutcomeCardModule(config: MergeOutcomeCardConfig) {
    return {
        __depends__: [OverlaysModule, ContextPadModule],
        __init__: ["mergeOutcomeCard"],
        mergeOutcomeCard: ["type", MergeOutcomeCard],
        mergeOutcomeCardConfig: ["value", config],
    };
}
