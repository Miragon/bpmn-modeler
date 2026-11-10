import { ActionNotice } from "../../kernel/domain/actionNotice";
import { ParsedMarketplaceEntry } from "./marketplaceRegistry";

/**
 * The labels of the registered marketplaces this workspace has cached nothing
 * for, in settings order. Entries that share a cache are named once, and an
 * entry that cannot be parsed is left out, as no update can fetch it.
 */
export function notFetchedMarketplaces(
    entries: readonly ParsedMarketplaceEntry[],
    cachedIds: ReadonlySet<string>,
): string[] {
    const named = new Set<string>();
    const labels: string[] = [];
    for (const entry of entries) {
        if (entry.kind !== "registered") continue;
        const { id } = entry.registration;
        if (cachedIds.has(id) || named.has(id)) continue;
        named.add(id);
        labels.push(entry.label);
    }
    return labels;
}

export const MARKETPLACE_UPDATE_NOTICE_ID = "marketplaceUpdateNotice";

export type MarketplaceUpdateNoticeAction = "update";

export function marketplaceUpdateNotice(
    labels: readonly string[],
): ActionNotice<MarketplaceUpdateNoticeAction> {
    const which =
        labels.length === 1 ? `the marketplace "${labels[0]}"` : `${labels.length} marketplaces`;
    return {
        id: MARKETPLACE_UPDATE_NOTICE_ID,
        tone: "info",
        message: `The element templates of ${which} are not fetched in this workspace yet.`,
        actions: [{ label: "Update marketplaces", value: "update" }],
    };
}
