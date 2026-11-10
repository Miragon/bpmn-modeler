import type {
    AddOnGroupPayload,
    AddOnPayload,
    AddOnSourcePayload,
} from "@miragon/bpmn-modeler-shared";
import { ChevronRight } from "lucide";

import { sourceActionEmphasis } from "../../domain/actionEmphasis";
import { rowStatusOf } from "../../domain/addOnStatus";
import { addOnsOf } from "../../domain/catalogQueries";
import {
    CHROME_TEXT,
    headSummaryText,
    KIND_TEXT,
    sourceActionsText,
} from "../../domain/chromeTexts";
import { headSummaryOf } from "../../domain/headSummary";
import { isBusy, ViewState } from "../../domain/viewState";
import { actionButton, el, hiddenText, icon, markFocus, setBusy, toggleButton } from "./dom";
import { SOURCE_ACTION_ICON, SOURCE_ICON } from "./icons";
import { menuAnchor } from "./menu";
import { kindTile, problemLine, statusBadge } from "./statusMarks";

export interface ListContext {
    readonly state: ViewState;
    /** Whether a group or source shows open: the user's choice, or every match while filtering. */
    readonly isOpen: (headId: string) => boolean;
    /** A search or filter shows every match: the heads are plain headers then. */
    readonly filterActive: boolean;
    readonly selectedId?: string;
    readonly revealedId?: string;
    readonly openMenu?: string;
    readonly onSelect: (addOnId: string) => void;
    readonly onMenu: (menuId: string) => void;
}

export function groupsOf(
    groups: readonly AddOnGroupPayload[],
    flat: boolean,
    context: ListContext,
): HTMLElement[] {
    return groups.map((group) => (flat ? flatGroupOf(group, context) : groupOf(group, context)));
}

function groupOf(group: AddOnGroupPayload, context: ListContext): HTMLElement {
    const open = context.isOpen(group.id);
    const section = el("section", "av-group");
    section.setAttribute("aria-label", group.label);
    const control = headControl(group.id, open, context.filterActive, "av-group-head");
    const text = el("span", "av-group-text");
    text.append(
        el("span", "av-group-label", group.label),
        el("span", "av-group-path", group.description),
    );
    control.append(chevron(), text, ...summaryOf(addOnsOf([group]), open));
    const heading = el("h2", "av-group-name");
    heading.append(control);
    section.append(heading);
    if (group.problem !== undefined) section.append(problemLine(group.problem, "av-group-problem"));
    if (open) section.append(...group.sources.map((source) => sourceOf(source, context)));
    return section;
}

function flatGroupOf(group: AddOnGroupPayload, context: ListContext): HTMLElement {
    const section = el("section", "av-group av-group-flat");
    section.setAttribute("aria-label", group.label);
    section.append(el("p", "av-group-intro", group.description));
    if (group.problem !== undefined) section.append(problemLine(group.problem, "av-group-problem"));
    section.append(...group.sources.map((source) => sourceOf(source, context)));
    return section;
}

function sourceOf(source: AddOnSourcePayload, context: ListContext): HTMLElement {
    const busy = isBusy(context.state, source.id);
    const hasRows = source.addOns.length > 0;
    const open = hasRows && context.isOpen(source.id);
    const block = el("div", "av-source");
    setBusy(block, busy);
    const head = el("div", "av-source-head");
    // A source without rows has nothing to open: a plain header with the chevron's room kept.
    const control = hasRows
        ? headControl(source.id, open, context.filterActive, "av-source-toggle")
        : staticHead("av-source-toggle", false);
    const titleLine = el("span", "av-source-title");
    titleLine.append(el("span", "av-source-label", source.label));
    if (source.stateText !== undefined) titleLine.append(el("span", "av-badge", source.stateText));
    const text = el("span", "av-source-text");
    text.append(titleLine, el("span", "av-source-description", source.description));
    control.append(
        hasRows ? chevron() : el("span", "av-head-chevron"),
        icon(SOURCE_ICON[source.kind], 16, "av-source-icon"),
        text,
        ...summaryOf(source.addOns, open || !hasRows),
    );
    const heading = el("h3", "av-source-heading");
    heading.append(control);
    head.append(heading);
    if (source.actions.length > 0) {
        const items = source.actions.map((action) =>
            actionButton(action, {
                targetId: source.id,
                busy,
                emphasis: sourceActionEmphasis(action.kind),
                icon: SOURCE_ACTION_ICON[action.kind],
                focus: "action",
            }),
        );
        const label = sourceActionsText(source.label);
        head.append(
            menuAnchor(source.id, label, context.openMenu === source.id, items, context.onMenu),
        );
    }
    block.append(head);
    if (busy) block.append(el("div", "ds-busy-bar av-source-busy"));
    if (source.problem !== undefined)
        block.append(problemLine(source.problem, "av-source-problem"));
    if (open) {
        const rows = el("div", "av-rows");
        rows.setAttribute("role", "list");
        rows.setAttribute("aria-label", source.label);
        rows.append(...source.addOns.map((addOn) => rowOf(addOn, context)));
        block.append(rows);
    }
    return block;
}

/** The whole header row is the toggle; while a filter shows every match it is a plain header. */
function headControl(headId: string, open: boolean, filterActive: boolean, className: string) {
    if (filterActive) return staticHead(className, open);
    const toggle = markFocus(toggleButton(headId, open, `av-head ${className}`), "head", headId);
    toggle.dataset.open = String(open);
    return toggle;
}

function staticHead(className: string, open: boolean): HTMLElement {
    const head = el("span", `av-head av-head-static ${className}`);
    head.dataset.open = String(open);
    return head;
}

function chevron(): SVGElement {
    return icon(ChevronRight, 16, "av-chevron av-head-chevron");
}

/** A closed header still says what it holds, and whether any of it waits for a review. */
function summaryOf(addOns: readonly AddOnPayload[], open: boolean): HTMLElement[] {
    if (open) return [];
    const { total, needingReview } = headSummaryOf(addOns);
    const summary = el("span", "av-head-summary");
    const count = el("span", "ds-count av-head-count", String(total));
    count.setAttribute("aria-hidden", "true");
    summary.append(count);
    if (needingReview > 0) {
        const dot = el("span", "av-dot av-head-dot");
        dot.setAttribute("aria-hidden", "true");
        dot.title = CHROME_TEXT.needsReview;
        summary.append(dot);
    }
    summary.append(hiddenText(`, ${headSummaryText(total, needingReview)}`));
    return [summary];
}

function rowOf(addOn: AddOnPayload, context: ListContext): HTMLElement {
    const item = el("div", "av-row-item");
    item.setAttribute("role", "listitem");
    setBusy(item, isBusy(context.state, addOn.id));
    const row = markFocus(el("button", "av-row"), "row", addOn.id);
    row.type = "button";
    if (addOn.id === context.selectedId) row.setAttribute("aria-current", "true");
    if (addOn.id === context.revealedId) row.classList.add("av-revealed");
    const name = el("span", "av-row-name");
    name.append(el("span", "av-row-title", addOn.name));
    if (addOn.detail !== undefined) name.append(el("span", "av-row-detail", addOn.detail));
    row.append(
        kindTile(addOn.kind),
        hiddenText(`${KIND_TEXT[addOn.kind].singular}, `),
        name,
        statusBadge(rowStatusOf(addOn), "av-row-status"),
    );
    if (isBusy(context.state, addOn.id)) row.append(el("span", "ds-busy-bar av-row-busy"));
    row.addEventListener("click", () => context.onSelect(addOn.id));
    item.append(row);
    return item;
}
