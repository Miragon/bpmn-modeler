import { describe, expect, it } from "vitest";

import { CachedSourceSlot } from "./sourceCacheRefresh";
import { MARKETPLACE_CACHE_TTL_MS, needsStartupRefresh } from "./startupRefresh";

const NOW = 1_800_000_000_000;

function slot(fetchedAt: number | undefined, sourceIndex = 0): CachedSourceSlot {
    return { sourceIndex, sourceIdentity: "source", fetchedAt };
}

describe("needsStartupRefresh", () => {
    it.each<{ behaviour: string; slots: CachedSourceSlot[]; expected: boolean }>([
        { behaviour: "fetches a marketplace nothing is cached for", slots: [], expected: true },
        {
            behaviour: "keeps a source fetched just now",
            slots: [slot(NOW)],
            expected: false,
        },
        {
            behaviour: "keeps a source fetched a moment inside the lifetime",
            slots: [slot(NOW - MARKETPLACE_CACHE_TTL_MS + 1)],
            expected: false,
        },
        {
            behaviour: "refreshes a source fetched exactly one lifetime ago",
            slots: [slot(NOW - MARKETPLACE_CACHE_TTL_MS)],
            expected: true,
        },
        {
            behaviour: "refreshes a source older than the lifetime",
            slots: [slot(NOW - 3 * MARKETPLACE_CACHE_TTL_MS)],
            expected: true,
        },
        {
            behaviour: "refreshes a source an earlier version cached without a date",
            slots: [slot(undefined)],
            expected: true,
        },
        {
            behaviour: "refreshes a source dated in the future",
            slots: [slot(NOW + 1)],
            expected: true,
        },
        {
            behaviour: "refreshes when one of several sources is stale",
            slots: [slot(NOW, 0), slot(NOW - MARKETPLACE_CACHE_TTL_MS, 1)],
            expected: true,
        },
        {
            behaviour: "keeps a marketplace whose sources are all fresh",
            slots: [slot(NOW, 0), slot(NOW - 1000, 1)],
            expected: false,
        },
    ])("$behaviour", ({ slots, expected }) => {
        expect(needsStartupRefresh(slots, NOW)).toBe(expected);
    });
});
