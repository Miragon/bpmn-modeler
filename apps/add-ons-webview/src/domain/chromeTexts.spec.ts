import { describe, expect, it } from "vitest";

import { CatalogFilter, NO_FILTER } from "./catalogFilter";
import {
    announcementOf,
    filterLabelText,
    headSummaryText,
    matchCountText,
    reviewCountText,
    sourceActionsText,
    summaryText,
} from "./chromeTexts";
import type { ListContent } from "./listContent";
import { sectionsOf } from "./listSections";
import { CATALOG } from "../__fixtures__/catalogs";

describe("headSummaryText", () => {
    it.each([
        [1, 0, "1 add-on"],
        [9, 0, "9 add-ons"],
        [9, 1, "9 add-ons, 1 waiting"],
        [9, 3, "9 add-ons, 3 waiting"],
    ])("says %i with %i waiting as %s", (total, waiting, text) => {
        expect(headSummaryText(total, waiting)).toBe(text);
    });
});

describe("summaryText", () => {
    it.each([
        [0, 0, ""],
        [2, 0, "2 waiting"],
        [0, 1, "1 not loaded"],
        [3, 2, "3 waiting · 2 not loaded"],
    ])("says %i waiting and %i not loaded as '%s'", (waiting, notLoaded, text) => {
        expect(summaryText(waiting, notLoaded)).toBe(text);
    });
});

describe("filterLabelText", () => {
    it.each([
        [0, "Filter add-ons"],
        [1, "Filter add-ons, 1 on"],
        [2, "Filter add-ons, 2 on"],
    ])("names %i chosen kinds as %s", (chosen, text) => {
        expect(filterLabelText(chosen)).toBe(text);
    });
});

describe("matchCountText", () => {
    it.each([
        [0, "No add-ons match your search and filters."],
        [1, "1 add-on shown"],
        [4, "4 add-ons shown"],
    ])("says %i matches as %s", (count, text) => {
        expect(matchCountText(count)).toBe(text);
    });
});

describe("reviewCountText", () => {
    it.each([
        [0, "No add-ons need review."],
        [1, "1 add-on needs review"],
        [3, "3 add-ons need review"],
    ])("says %i to review as %s", (count, text) => {
        expect(reviewCountText(count)).toBe(text);
    });
});

describe("announcementOf", () => {
    const query: CatalogFilter = { ...NO_FILTER, query: "e" };
    const listed: ListContent = { kind: "sections", sections: sectionsOf(CATALOG.groups) };

    it.each<{ case: string; content: ListContent; filter: CatalogFilter; text: string }>([
        { case: "a list without a filter", content: listed, filter: NO_FILTER, text: "" },
        { case: "what a search lists", content: listed, filter: query, text: "4 add-ons shown" },
        {
            case: "a search that matches nothing",
            content: { kind: "noMatch" },
            filter: query,
            text: "No add-ons match your search and filters.",
        },
        {
            case: "a search over an empty catalog",
            content: { kind: "catalogEmpty", buttons: [] },
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
