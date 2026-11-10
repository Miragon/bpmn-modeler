import { describe, expect, it } from "vitest";

import { MarketplaceRegistry } from "./marketplaceRegistry";
import {
    MARKETPLACE_UPDATE_NOTICE_ID,
    marketplaceUpdateNotice,
    notFetchedMarketplaces,
} from "./notFetchedMarketplaces";

function entriesOf(...settings: unknown[]) {
    return MarketplaceRegistry.fromEntries(settings as never[]).entries;
}

function idOf(location: string): string {
    const [entry] = entriesOf(location);
    if (entry.kind !== "registered") throw new Error(`${location} does not parse`);
    return entry.registration.id;
}

describe("notFetchedMarketplaces", () => {
    it("names each registered marketplace nothing is cached for, in settings order", () => {
        const entries = entriesOf("/work/b", "/work/a", "/work/c");

        expect(notFetchedMarketplaces(entries, new Set([idOf("/work/a")]))).toEqual([
            "/work/b",
            "/work/c",
        ]);
    });

    it("names nothing when every marketplace has a cache", () => {
        const entries = entriesOf("/work/a");

        expect(notFetchedMarketplaces(entries, new Set([idOf("/work/a")]))).toEqual([]);
    });

    it("leaves out an entry that cannot be parsed, as no update can fetch it", () => {
        const entries = entriesOf("not a marketplace", "/work/a");

        expect(notFetchedMarketplaces(entries, new Set())).toEqual(["/work/a"]);
    });

    it("names two spellings of one repository once, as they share one cache", () => {
        const entries = entriesOf("https://github.com/acme/templates", {
            provider: "github",
            repo: "acme/templates",
        });

        expect(notFetchedMarketplaces(entries, new Set())).toEqual([
            "https://github.com/acme/templates",
        ]);
    });
});

describe("marketplaceUpdateNotice", () => {
    it("names a single marketplace and offers the update", () => {
        expect(marketplaceUpdateNotice(["github.com/acme/templates"])).toEqual({
            id: MARKETPLACE_UPDATE_NOTICE_ID,
            tone: "info",
            message:
                'The element templates of the marketplace "github.com/acme/templates" are not fetched in this workspace yet.',
            actions: [{ label: "Update marketplaces", value: "update" }],
        });
    });

    it("counts several marketplaces", () => {
        expect(marketplaceUpdateNotice(["/work/a", "/work/b"]).message).toBe(
            "The element templates of 2 marketplaces are not fetched in this workspace yet.",
        );
    });
});
