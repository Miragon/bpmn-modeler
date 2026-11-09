import { describe, expect, expectTypeOf, it } from "vitest";

import { type AddOnActionKind, type CatalogActionKind, type SourceActionKind } from "./addOnIds";
import { type AddOnRequest, catalogActionRefusalOf, REPORTED_BY_FLOW } from "./addOnRequests";

describe("AddOnRequest", () => {
    it("asks for every action a row or the catalog offers, and for a refresh", () => {
        expectTypeOf<Exclude<AddOnRequest["kind"], "refresh">>().toEqualTypeOf<
            AddOnActionKind | SourceActionKind | CatalogActionKind
        >();
    });
});

describe("catalogActionRefusalOf", () => {
    it("refuses nothing the latest build offered", () => {
        expect(
            catalogActionRefusalOf(["addMarketplace", "pruneCache"], "addMarketplace"),
        ).toBeUndefined();
    });

    it("refuses what it did not offer", () => {
        expect(catalogActionRefusalOf(["pruneCache"], "updateMarketplaces")).toEqual({
            kind: "refused",
            reason: "notOffered",
            message: "The list offers no such action now. Check it again.",
        });
    });

    it("leaves the result of a marketplace flow to the flow", () => {
        expect(REPORTED_BY_FLOW).toEqual({ kind: "reportedByFlow" });
    });
});
