import { createElement } from "@miragon/bpmn-modeler-types";

import "./mergeTooltip.css";

/** The text of an element's styled tooltip; the element needs no native `title`. */
export const MERGE_TOOLTIP_ATTRIBUTE = "data-merge-tooltip";

const LAYER_ID = "merge-tooltip";
const WINDOW_MARGIN = 8;
const ANCHOR_GAP = 6;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"]);

const installed = new WeakSet<Document>();

/**
 * Shows the merge chrome's styled tooltip for every element that carries
 * {@link MERGE_TOOLTIP_ATTRIBUTE}, on the user's hover and on the user's
 * keyboard focus only. An element that appears under a resting pointer, or
 * that the page focuses, shows none, so a step that opens the context pad
 * shows no tooltip. One layer per page, fixed and kept inside the window,
 * so no pane edge clips it. Idempotent.
 */
export function installMergeTooltips(document: Document): void {
    if (installed.has(document)) return;
    installed.add(document);
    const layer = createElement("div", "merge-tooltip");
    layer.id = LAYER_ID;
    layer.setAttribute("role", "tooltip");
    layer.hidden = true;
    document.body.append(layer);
    new TooltipLayer(document, layer).listen();
}

class TooltipLayer {
    private shownFor: HTMLElement | undefined;

    private keyboardFocus = false;

    private lastPointer: { x: number; y: number } | undefined;

    constructor(
        private readonly document: Document,
        private readonly layer: HTMLElement,
    ) {}

    listen(): void {
        const { document } = this;
        document.addEventListener("pointermove", (event) => this.onPointerMove(event));
        document.addEventListener("focusin", (event) => {
            const anchor = anchorOf(event.target);
            if (anchor && this.keyboardFocus) this.show(anchor);
            else this.hide();
        });
        document.addEventListener("focusout", () => this.hide());
        document.addEventListener("pointerdown", () => {
            this.keyboardFocus = false;
            this.hide();
        });
        document.addEventListener("keydown", (event) => {
            if (MODIFIER_KEYS.has(event.key)) return;
            this.keyboardFocus = true;
            this.hide();
        });
        document.addEventListener("wheel", () => this.hide(), { passive: true });
        document.defaultView?.addEventListener("blur", () => this.hide());
    }

    private onPointerMove(event: MouseEvent): void {
        const moved =
            this.lastPointer === undefined ||
            this.lastPointer.x !== event.clientX ||
            this.lastPointer.y !== event.clientY;
        this.lastPointer = { x: event.clientX, y: event.clientY };
        if (!moved) return;
        const anchor = anchorOf(event.target);
        if (anchor) this.show(anchor);
        else this.hide();
    }

    private show(anchor: HTMLElement): void {
        const text = anchor.getAttribute(MERGE_TOOLTIP_ATTRIBUTE);
        if (!text) {
            this.hide();
            return;
        }
        if (this.shownFor !== anchor) this.hide();
        this.shownFor = anchor;
        // An anchor that names its own description keeps it; the layer's text says the same.
        if (
            anchor.getAttribute("aria-label") !== text &&
            !anchor.hasAttribute("aria-describedby")
        ) {
            anchor.setAttribute("aria-describedby", LAYER_ID);
        }
        this.layer.textContent = text;
        this.layer.hidden = false;
        this.place(anchor);
    }

    private hide(): void {
        if (this.shownFor?.getAttribute("aria-describedby") === LAYER_ID) {
            this.shownFor.removeAttribute("aria-describedby");
        }
        this.shownFor = undefined;
        this.layer.hidden = true;
    }

    /** Below the anchor, or above it where the window ends; centred on it and inside the window. */
    private place(anchor: HTMLElement): void {
        const view = this.document.defaultView;
        const box = anchor.getBoundingClientRect();
        const { width, height } = this.layer.getBoundingClientRect();
        const windowWidth = view?.innerWidth ?? 0;
        const windowHeight = view?.innerHeight ?? 0;
        const below = box.bottom + ANCHOR_GAP;
        const top =
            below + height + WINDOW_MARGIN > windowHeight ? box.top - ANCHOR_GAP - height : below;
        const centred = box.left + box.width / 2 - width / 2;
        const left = Math.min(centred, windowWidth - WINDOW_MARGIN - width);
        this.layer.style.top = `${Math.max(WINDOW_MARGIN, top)}px`;
        this.layer.style.left = `${Math.max(WINDOW_MARGIN, left)}px`;
    }
}

function anchorOf(target: EventTarget | null): HTMLElement | undefined {
    return target instanceof Element
        ? (target.closest<HTMLElement>(`[${MERGE_TOOLTIP_ATTRIBUTE}]`) ?? undefined)
        : undefined;
}
