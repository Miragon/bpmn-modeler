import type {
    AddOnGroupPayload,
    AddOnPayload,
    AddOnSourcePayload,
} from "@miragon/bpmn-modeler-shared";
import { ChevronRight } from "lucide";

import { sourceActionEmphasis } from "../../domain/actionEmphasis";
import { rowStatusOf } from "../../domain/addOnStatus";
import { addOnsOf, Placement } from "../../domain/catalogQueries";
import {
    CHROME_TEXT,
    headSummaryText,
    KIND_TEXT,
    sourceActionsText,
} from "../../domain/chromeTexts";
import { headSummaryOf } from "../../domain/headSummary";
import type { ListSections } from "../../domain/listSections";
import { isBusy, ViewState } from "../../domain/viewState";
import { actionButton, el, hiddenText, icon, markFocus, setBusy, toggleButton } from "./dom";
import { KIND_ICON, SOURCE_ACTION_ICON, SOURCE_ICON } from "./icons";
import { menuAnchor } from "./menu";
import { problemLine, statusBadge } from "./statusMarks";

export interface ListContext {
    readonly state: ViewState;
    /** Whether a group or source shows open: the user's choice, or, while filtering, open until they close it. */
    readonly isOpen: (headId: string) => boolean;
    readonly selectedId?: string;
    readonly revealedId?: string;
    readonly openMenu?: string;
    readonly onSelect: (addOnId: string) => void;
    readonly onMenu: (menuId: string) => void;
}

/** Needs attention, Installed and Marketplaces, from top to bottom; a section with nothing to show is left out. */
export function sectionsListOf(
    sections: ListSections,
    installedText: string | undefined,
    context: ListContext,
): HTMLElement[] {
    const parts: HTMLElement[] = [];
    if (sections.attention.length > 0) parts.push(attentionOf(sections.attention, context));
    if (sections.installed.length > 0 || installedText !== undefined) {
        const installed = section(CHROME_TEXT.installed);
        if (installedText !== undefined)
            installed.append(el("p", "av-section-text", installedText));
        installed.append(
            ...sections.installed.map((group) =>
                sections.flatGroupIds.has(group.id)
                    ? flatGroupOf(group, context)
                    : groupOf(group, context, 3),
            ),
        );
        parts.push(installed);
    }
    if (sections.marketplaces !== undefined) {
        parts.push(groupOf(sections.marketplaces, context, 2));
    }
    return parts;
}

function section(label: string, count?: number): HTMLElement {
    const block = el("section", "av-section");
    block.setAttribute("aria-label", label);
    const heading = el("h2", "av-section-head");
    heading.append(el("span", "av-section-label", label));
    if (count !== undefined) {
        const pill = el("span", "ds-count av-section-count", String(count));
        pill.setAttribute("aria-hidden", "true");
        heading.append(pill);
    }
    block.append(heading);
    return block;
}

function attentionOf(placements: readonly Placement[], context: ListContext): HTMLElement {
    const block = section(CHROME_TEXT.needsAttention, placements.length);
    block.classList.add("av-attention");
    const rows = el("div", "av-rows");
    rows.setAttribute("role", "list");
    rows.append(...placements.map(({ addOn, source }) => rowOf(addOn, context, source.label)));
    block.append(rows);
    return block;
}

type HeadingLevel = 2 | 3 | 4;

/** The marketplaces head a section of their own; a folder heads its sources under Installed. */
function groupOf(group: AddOnGroupPayload, context: ListContext, level: 2 | 3): HTMLElement {
    const open = context.isOpen(group.id);
    const block = el("section", "av-group");
    block.setAttribute("aria-label", group.label);
    const control = headControl(group.id, open, "av-group-head");
    control.title = group.description;
    const text = el("span", "av-group-text");
    text.append(el("span", "av-group-label", group.label));
    control.append(chevron(), text, ...summaryOf(addOnsOf([group]), open));
    const heading = el(`h${level}`, "av-group-name");
    heading.append(control);
    block.append(heading);
    if (group.problem !== undefined) block.append(problemLine(group.problem, "av-group-problem"));
    if (open) {
        block.append(...group.sources.map((source) => sourceOf(source, context, nextLevel(level))));
    }
    return block;
}

function nextLevel(level: 2 | 3): HeadingLevel {
    return level === 2 ? 3 : 4;
}

/** The only folder: its sources stand directly under Installed, its path in their tooltip. */
function flatGroupOf(group: AddOnGroupPayload, context: ListContext): HTMLElement {
    const block = el("div", "av-group av-group-flat");
    if (group.problem !== undefined) block.append(problemLine(group.problem, "av-group-problem"));
    block.append(...group.sources.map((source) => sourceOf(source, context, 3)));
    return block;
}

function sourceOf(
    source: AddOnSourcePayload,
    context: ListContext,
    level: HeadingLevel,
): HTMLElement {
    const busy = isBusy(context.state, source.id);
    const hasRows = source.addOns.length > 0;
    const open = hasRows && context.isOpen(source.id);
    const block = el("div", "av-source");
    setBusy(block, busy);
    const head = el("div", "av-source-head");
    // A source without rows has nothing to open: a plain header with the chevron's room kept.
    const control = hasRows
        ? headControl(source.id, open, "av-source-toggle")
        : staticHead("av-source-toggle");
    const titleLine = el("span", "av-source-title");
    titleLine.append(el("span", "av-source-label", source.label));
    if (source.stateText !== undefined) titleLine.append(el("span", "av-badge", source.stateText));
    const text = el("span", "av-source-text");
    text.append(titleLine);
    control.title = source.description;
    control.append(
        hasRows ? chevron() : el("span", "av-head-chevron"),
        icon(SOURCE_ICON[source.kind], 16, "av-source-icon"),
        text,
        ...summaryOf(source.addOns, open || !hasRows),
    );
    const heading = el(`h${level}`, "av-source-heading");
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

/** The whole header row is the toggle. */
function headControl(headId: string, open: boolean, className: string) {
    const toggle = markFocus(toggleButton(headId, open, `av-head ${className}`), "head", headId);
    toggle.dataset.open = String(open);
    return toggle;
}

function staticHead(className: string): HTMLElement {
    return el("span", `av-head av-head-static ${className}`);
}

function chevron(): SVGElement {
    return icon(ChevronRight, 16, "av-chevron av-head-chevron");
}

/** A closed header still says what it holds, and whether any of it waits for a review. */
function summaryOf(addOns: readonly AddOnPayload[], open: boolean): HTMLElement[] {
    if (open) return [];
    const { total, waiting } = headSummaryOf(addOns);
    const summary = el("span", "av-head-summary");
    const count = el("span", "ds-count av-head-count", String(total));
    count.setAttribute("aria-hidden", "true");
    summary.append(count);
    if (waiting > 0) {
        const dot = el("span", "av-dot av-head-dot");
        dot.setAttribute("aria-hidden", "true");
        dot.title = CHROME_TEXT.waiting;
        summary.append(dot);
    }
    summary.append(hiddenText(`, ${headSummaryText(total, waiting)}`));
    return [summary];
}

/** A row says its kind by a quiet glyph, and its status only when it is not settled. */
function rowOf(addOn: AddOnPayload, context: ListContext, sourceLabel?: string): HTMLElement {
    const item = el("div", "av-row-item");
    item.setAttribute("role", "listitem");
    setBusy(item, isBusy(context.state, addOn.id));
    const row = markFocus(el("button", "av-row"), "row", addOn.id);
    row.type = "button";
    if (addOn.id === context.selectedId) row.setAttribute("aria-current", "true");
    if (addOn.id === context.revealedId) row.classList.add("av-revealed");
    const name = el("span", "av-row-name");
    name.append(el("span", "av-row-title", addOn.name));
    const detail = [addOn.detail, sourceLabel].filter((part) => part !== undefined).join(" · ");
    if (detail !== "") name.append(el("span", "av-row-detail", detail));
    row.append(
        icon(KIND_ICON[addOn.kind], 16, "av-row-kind"),
        hiddenText(`${KIND_TEXT[addOn.kind].singular}, `),
        name,
    );
    const status = rowStatusOf(addOn);
    if (status !== undefined) row.append(statusBadge(status, "av-row-status"));
    if (isBusy(context.state, addOn.id)) row.append(el("span", "ds-busy-bar av-row-busy"));
    row.addEventListener("click", () => context.onSelect(addOn.id));
    item.append(row);
    return item;
}
