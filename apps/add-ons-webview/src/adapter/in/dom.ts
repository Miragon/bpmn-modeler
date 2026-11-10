import type { ActionViewPayload } from "@miragon/bpmn-modeler-shared";
import { createElement, IconNode } from "lucide";

import type { Emphasis } from "../../domain/actionEmphasis";
import { CATALOG_TARGET } from "../../domain/viewState";

/** The owner of a catalog action, which is also the id of the "More actions" menu. */
export const CATALOG_OWNER = CATALOG_TARGET;

/** Builds an element with the DOM API only: names and paths are workspace text. */
export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const created = document.createElement(tag);
    if (className) created.className = className;
    if (text !== undefined) created.textContent = text;
    return created;
}

/** A Lucide icon: outline in currentColor, stroke 2.5 on the 24 grid (brand §11). */
export function icon(node: IconNode, size = 16, className = ""): SVGElement {
    return createElement(node, {
        "width": size,
        "height": size,
        "stroke-width": 2.5,
        "class": `ds-icon ${className}`.trim(),
        "aria-hidden": "true",
        "focusable": "false",
    });
}

/** Text only a screen reader reads. */
export function hiddenText(text: string): HTMLSpanElement {
    return el("span", "av-vh", text);
}

/** The places focus can return to after a render rebuilt the element that held it. */
export type FocusKind =
    | "tab"
    | "chip"
    | "menu"
    | "head"
    | "row"
    | "name"
    | "review"
    | "action"
    | "scopeAction"
    | "back"
    | "clearFilters";

export interface FocusPlace {
    readonly kind: FocusKind;
    readonly id: string;
    /** The add-on, source or menu an action button belongs to. */
    readonly owner?: string;
}

export function markFocus<E extends HTMLElement>(
    element: E,
    kind: FocusKind,
    id = "",
    owner?: string,
): E {
    element.dataset.focus = kind;
    element.dataset.focusId = id;
    if (owner !== undefined) element.dataset.focusOwner = owner;
    return element;
}

export function focusPlaceOf(element: Element | null): FocusPlace | undefined {
    const marked = element?.closest<HTMLElement>("[data-focus]");
    if (marked === null || marked === undefined) return undefined;
    const { focus, focusId = "", focusOwner } = marked.dataset;
    return { kind: focus as FocusKind, id: focusId, owner: focusOwner };
}

export function elementAt(root: ParentNode, { kind, id }: FocusPlace): HTMLElement | null {
    return root.querySelector<HTMLElement>(
        `[data-focus="${kind}"][data-focus-id="${CSS.escape(id)}"]`,
    );
}

export function button(className: string, label?: string): HTMLButtonElement {
    const created = el("button", className);
    created.type = "button";
    if (label !== undefined) created.setAttribute("aria-label", label);
    return created;
}

/**
 * A button the view's click handler turns into `actionChosen`. `targetId`
 * absent: a catalog action. Busy: `aria-disabled`, so focus stays on it.
 */
export function actionButton(
    action: ActionViewPayload<string>,
    options: {
        readonly targetId?: string;
        readonly emphasis: Emphasis;
        readonly busy: boolean;
        readonly icon?: IconNode;
        readonly focus: FocusKind;
    },
): HTMLButtonElement {
    const created = button(`ds-btn ds-btn-${options.emphasis}`);
    if (options.icon) created.append(icon(options.icon));
    created.append(el("span", "ds-btn-label", action.label));
    created.dataset.actionKind = action.kind;
    if (options.targetId !== undefined) created.dataset.targetId = options.targetId;
    if (options.busy) created.setAttribute("aria-disabled", "true");
    const owner = options.targetId ?? CATALOG_OWNER;
    return markFocus(created, options.focus, `${owner}|${action.kind}`, owner);
}

/** A button the view's click handler turns into `toggled` for this key. */
export function toggleButton(key: string, open: boolean, className: string): HTMLButtonElement {
    const created = button(className);
    created.dataset.toggle = key;
    created.setAttribute("aria-expanded", String(open));
    return created;
}

export function setBusy(element: HTMLElement, busy: boolean): void {
    if (busy) element.setAttribute("aria-busy", "true");
    else element.removeAttribute("aria-busy");
}
