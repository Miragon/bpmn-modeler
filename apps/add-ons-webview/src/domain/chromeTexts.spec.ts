import { describe, expect, it } from "vitest";

import { CATALOG } from "../__fixtures__/catalogs";
import { CatalogFilter, NEEDS_REVIEW_ONLY, NO_FILTER } from "./catalogFilter";
import { announcementOf, headSummaryText, matchCountText, sourceActionsText } from "./chromeTexts";
import type { ListContent } from "./listContent";

describe("headSummaryText", () => {
    it.each([
        [1, 0, "1 add-on"],
        [9, 0, "9 add-ons"],
        [9, 1, "9 add-ons, 1 needs review"],
        [9, 3, "9 add-ons, 3 need review"],
    ])("says %i with %i to review as %s", (total, needingReview, text) => {
        expect(headSummaryText(total, needingReview)).toBe(text);
    });
});

describe("matchCountText", () => {
    const query: CatalogFilter = { ...NO_FILTER, query: "mail" };
    const reviewAndKind: CatalogFilter = { ...NEEDS_REVIEW_ONLY, kinds: new Set(["plugin"]) };

    it.each<{ count: number; under: string; filter: CatalogFilter; text: string }>([
        {
            count: 0,
            under: "a search",
            filter: query,
            text: "No add-ons match your search and filters.",
        },
        { count: 1, under: "a search", filter: query, text: "1 add-on shown" },
        { count: 4, under: "a search", filter: query, text: "4 add-ons shown" },
        {
            count: 2,
            under: "the review chip and a kind",
            filter: reviewAndKind,
            text: "2 add-ons shown",
        },
        {
            count: 0,
            under: "only the review chip",
            filter: NEEDS_REVIEW_ONLY,
            text: "No add-ons need review.",
        },
        {
            count: 1,
            under: "only the review chip",
            filter: NEEDS_REVIEW_ONLY,
            text: "1 add-on needs review",
        },
        {
            count: 3,
            under: "only the review chip",
            filter: NEEDS_REVIEW_ONLY,
            text: "3 add-ons need review",
        },
    ])("says $count under $under as $text", ({ count, filter, text }) => {
        expect(matchCountText(count, filter)).toBe(text);
    });
});

describe("announcementOf", () => {
    const query: CatalogFilter = { ...NO_FILTER, query: "e" };
    const folderListed: ListContent = {
        kind: "groups",
        groups: [CATALOG.groups[0]!],
        flat: false,
        buttons: [],
    };

    it.each<{ case: string; content: ListContent; filter: CatalogFilter; text: string }>([
        {
            case: "a listed tab without a filter",
            content: folderListed,
            filter: NO_FILTER,
            text: "",
        },
        {
            case: "what a search lists",
            content: folderListed,
            filter: query,
            text: "3 add-ons shown",
        },
        {
            case: "what the review chip lists",
            content: folderListed,
            filter: NEEDS_REVIEW_ONLY,
            text: "3 add-ons need review",
        },
        {
            case: "a review that matches nothing",
            content: { kind: "noMatch", reason: "nothingToReview", buttons: [] },
            filter: NEEDS_REVIEW_ONLY,
            text: "No add-ons need review.",
        },
        {
            case: "a search that matches nothing",
            content: { kind: "noMatch", reason: "filters", buttons: [] },
            filter: query,
            text: "No add-ons match your search and filters.",
        },
        {
            case: "a review over a workspace that lists nothing, as its own text says why",
            content: { kind: "workspaceEmpty", text: "Open a folder to see its add-ons." },
            filter: NEEDS_REVIEW_ONLY,
            text: "",
        },
        {
            case: "a search over an empty catalog",
            content: { kind: "catalogEmpty", buttons: [] },
            filter: query,
            text: "",
        },
        {
            case: "a search over a tab without a marketplace",
            content: { kind: "noMarketplace", buttons: [] },
            filter: query,
            text: "",
        },
    ])("announces $case as '$text'", ({ content, filter, text }) => {
        expect(announcementOf(content, filter)).toBe(text);
    });
});

describe("sourceActionsText", () => {
    it("names the source the menu belongs to", () => {
        expect(sourceActionsText("/shared")).toBe("Source actions: /shared");
    });
});
