import { describe, expect, it } from "vitest";

import { ACME, CATALOG, MAIL, MARKETPLACE_SOURCE, PALETTE, RESIZE } from "../__fixtures__/catalogs";
import { addOnsOf, placementOf, sourceOf } from "./catalogQueries";

describe("addOnsOf", () => {
    it("lists every add-on in list order", () => {
        expect(addOnsOf(CATALOG.groups).map(({ id }) => id)).toEqual([
            PALETTE.id,
            RESIZE.id,
            ACME.id,
            MAIL.id,
        ]);
    });
});

describe("placementOf", () => {
    it("names the add-on's group and source", () => {
        const placement = placementOf(CATALOG.groups, MAIL.id);

        expect([placement?.group.id, placement?.source.id, placement?.addOn]).toEqual([
            "marketplaces",
            MARKETPLACE_SOURCE.id,
            MAIL,
        ]);
    });

    it("finds nothing for an id the groups do not hold", () => {
        expect(placementOf(CATALOG.groups, "plugin:/gone")).toBeUndefined();
    });
});

describe("sourceOf", () => {
    it.each([
        [MARKETPLACE_SOURCE.id, MARKETPLACE_SOURCE],
        [MAIL.id, undefined],
    ])("finds the source %s", (id, expected) => {
        expect(sourceOf(CATALOG.groups, id)).toBe(expected);
    });
});
