import type { AddOnKind } from "./catalogFilter";
import type { CatalogScope } from "./catalogScope";

/*
 * The view's own words: its controls, its states and what a screen reader
 * hears about them. Every other text comes from the core's model.
 */

export const CHROME_TEXT = {
    title: "Add-ons",
    loading: "Loading…",
    dismiss: "Dismiss",
    scopes: "Show add-ons from",
    search: "Search add-ons",
    clearSearch: "Clear search",
    filters: "Filter add-ons",
    needsReview: "Needs review",
    problem: "Problem",
    noMatch: "No add-ons match your search and filters.",
    clearFilters: "Clear filters",
    noMarketplace: "No marketplaces registered yet.",
    noWorkspaceAddOn: "No plugins, rule packages or templates in this workspace.",
    hint: "Select an add-on to read what it is and what you can do with it.",
    back: "Back",
    moreActions: "More actions",
} as const;

export const SCOPE_TEXT: Readonly<Record<CatalogScope, string>> = {
    workspace: "Workspace",
    marketplaces: "Marketplaces",
};

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
export function headSummaryText(total: number, needingReview: number): string {
    const addOns = `${total} ${total === 1 ? "add-on" : "add-ons"}`;
    if (needingReview === 0) return addOns;
    return `${addOns}, ${needingReview} ${needingReview === 1 ? "needs" : "need"} review`;
}

/** What a search or filter left, announced as the list changes. */
export function matchCountText(count: number): string {
    if (count === 0) return CHROME_TEXT.noMatch;
    return `${count} ${count === 1 ? "add-on" : "add-ons"} shown`;
}
