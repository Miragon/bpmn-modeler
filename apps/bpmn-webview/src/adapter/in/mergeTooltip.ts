import { createElement } from "@miragon/bpmn-modeler-types";

import "./mergeTooltip.css";

const TOOLTIP_ATTRIBUTE = "data-merge-tooltip";
const WINDOW_MARGIN = 8;
const ANCHOR_GAP = 6;

let layer: HTMLElement | undefined;
let shownFor: HTMLElement | undefined;

/**
 * Gives `element` a styled tooltip, shown at once on hover and on keyboard
 * focus; `undefined` removes it. The text also becomes the element's
 * description for screen readers while it shows. A stylesheet can switch an
 * element's tooltip off with `--merge-tooltip: off`, as the bar does for
 * labels it shows in full.
 */
export function setMergeTooltip(element: HTMLElement, text: string | undefined): void {
    installMergeTooltips(element.ownerDocument);
    if (text === undefined || text === "") {
        element.removeAttribute(TOOLTIP_ATTRIBUTE);
        if (shownFor === element) hide();
    } else {
        element.setAttribute(TOOLTIP_ATTRIBUTE, text);
        if (shownFor === element) show(element);
    }
}

/**
 * One tooltip layer per page, fixed above everything and kept inside the
 * window, so no scrolling menu or pane edge clips it. Idempotent.
 */
function installMergeTooltips(document: Document): void {
    if (layer) return;
    layer = createElement("div", "merge-tooltip");
    layer.id = "merge-tooltip";
    layer.setAttribute("role", "tooltip");
    layer.hidden = true;
    document.body.append(layer);
    const anchorOf = (target: EventTarget | null) =>
        target instanceof Element
            ? (target.closest<HTMLElement>(`[${TOOLTIP_ATTRIBUTE}]`) ?? undefined)
            : undefined;
    // A click focuses its button too; showing the tooltip then would leave it standing after the pointer left.
    let focusFromPointer = false;
    document.addEventListener("pointerover", (event) => {
        const anchor = anchorOf(event.target);
        if (anchor) show(anchor);
        else if (shownFor && (focusFromPointer || !shownFor.matches(":focus-within"))) hide();
    });
    document.addEventListener("focusin", (event) => {
        const anchor = anchorOf(event.target);
        if (anchor && !focusFromPointer) show(anchor);
        else hide();
    });
    document.addEventListener("focusout", () => hide());
    document.addEventListener("pointerdown", () => {
        focusFromPointer = true;
        hide();
    });
    document.addEventListener("keydown", (event) => {
        focusFromPointer = false;
        if (event.key === "Escape") hide();
    });
    window.addEventListener("blur", () => hide());
}

function show(anchor: HTMLElement): void {
    const text = anchor.getAttribute(TOOLTIP_ATTRIBUTE);
    const off = getComputedStyle(anchor).getPropertyValue("--merge-tooltip").trim() === "off";
    if (!layer || !text || off) {
        hide();
        return;
    }
    if (shownFor && shownFor !== anchor) shownFor.removeAttribute("aria-describedby");
    shownFor = anchor;
    anchor.setAttribute("aria-describedby", layer.id);
    layer.textContent = text;
    layer.hidden = false;
    place(anchor, layer);
}

function hide(): void {
    shownFor?.removeAttribute("aria-describedby");
    shownFor = undefined;
    if (layer) layer.hidden = true;
}

// Below the anchor, or above it where the window ends; centred on it and kept inside the window.
function place(anchor: HTMLElement, tooltip: HTMLElement): void {
    const anchorBox = anchor.getBoundingClientRect();
    const { width, height } = tooltip.getBoundingClientRect();
    const below = anchorBox.bottom + ANCHOR_GAP;
    const top =
        below + height + WINDOW_MARGIN > window.innerHeight
            ? anchorBox.top - ANCHOR_GAP - height
            : below;
    const centred = anchorBox.left + anchorBox.width / 2 - width / 2;
    const left = Math.min(
        Math.max(WINDOW_MARGIN, centred),
        window.innerWidth - WINDOW_MARGIN - width,
    );
    tooltip.style.top = `${Math.max(WINDOW_MARGIN, top)}px`;
    tooltip.style.left = `${Math.max(WINDOW_MARGIN, left)}px`;
}
