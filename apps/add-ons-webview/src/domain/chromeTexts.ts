import { AddOnKind, CatalogFilter, isFilterActive } from "./catalogFilter";
import { addOnsOf } from "./catalogQueries";
import type { ListContent } from "./listContent";
import { sectionGroupsOf } from "./listSections";

/*
 * The view's own words: its controls, its sections and what a screen reader
 * hears about them. Every other text comes from the core's model.
 */

export const CHROME_TEXT = {
    title: "Add-ons",
    loading: "Loading…",
    dismiss: "Dismiss",
    search: "Search add-ons",
    clearSearch: "Clear search",
    filterKinds: "Show kinds",
    needsAttention: "Needs attention",
    installed: "Installed",
    waiting: "Waiting",
    notLoaded: "Not loaded",
    noMatch: "No add-ons match your search and filters.",
    clearFilters: "Clear search and filters",
    hint: "No add-on selected.",
    back: "Back",
    moreActions: "More actions",
} as const;

export const KIND_TEXT: Readonly<
    Record<AddOnKind, { readonly singular: string; readonly plural: string }>
> = {
    plugin: { singular: "Plugin", plural: "Plugins" },
    rulePackage: { singular: "Rule package", plural: "Rule packages" },
    elementTemplate: { singular: "Template", plural: "Templates" },
};

export function sourceActionsText(sourceLabel: string): string {
    return `Source actions: ${sourceLabel}`;
}

/** What a closed header holds, for a screen reader: its count and dot are hidden from it. */
export function headSummaryText(total: number, waiting: number): string {
    const addOns = `${total} ${total === 1 ? "add-on" : "add-ons"}`;
    return waiting === 0 ? addOns : `${addOns}, ${waiting} waiting`;
}

/** The header line's account of what needs attention; nothing while all is quiet. */
export function summaryText(waiting: number, notLoaded: number): string {
    return [
        ...(waiting > 0 ? [`${waiting} waiting`] : []),
        ...(notLoaded > 0 ? [`${notLoaded} not loaded`] : []),
    ].join(" · ");
}

/** The filter button's name says how many kinds it narrows to, as its dot is hidden from a screen reader. */
export function filterLabelText(chosenKinds: number): string {
    return chosenKinds === 0 ? "Filter add-ons" : `Filter add-ons, ${chosenKinds} on`;
}

/** What a search or filter left, announced as the list changes. */
export function matchCountText(count: number): string {
    if (count === 0) return CHROME_TEXT.noMatch;
    return `${count} ${count === 1 ? "add-on" : "add-ons"} shown`;
}

/** What Review Add-ons found, announced as it lands on the list. */
export function reviewCountText(count: number): string {
    if (count === 0) return "No add-ons need review.";
    return count === 1 ? "1 add-on needs review" : `${count} add-ons need review`;
}

/** What the list a search or filter left says, for a screen reader. */
export function announcementOf(content: ListContent, filter: CatalogFilter): string {
    if (!isFilterActive(filter)) return "";
    switch (content.kind) {
        case "sections": {
            const { sections } = content;
            const count = sections.attention.length + addOnsOf(sectionGroupsOf(sections)).length;
            return matchCountText(count);
        }
        case "noMatch":
            return matchCountText(0);
        case "catalogEmpty":
            return "";
    }
}
