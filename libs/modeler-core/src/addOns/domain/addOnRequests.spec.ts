import { describe, expect, expectTypeOf, it } from "vitest";

import { type AddOnActionKind, type CatalogActionKind, type SourceActionKind } from "./addOnIds";
import {
    type AddOnRequest,
    addOnRequestOf,
    catalogActionRefusalOf,
    REPORTED_BY_FLOW,
} from "./addOnRequests";

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

describe("addOnRequestOf", () => {
    it.each<AddOnRequest>([
        { kind: "inspect", addOnId: "rulePackage:/work/node_modules/acme" },
        { kind: "allow", addOnId: "plugin:/work/.camunda/plugins/resize", revision: 1_794_000 },
        { kind: "revoke", addOnId: "plugin:/work/.camunda/plugins/resize" },
        { kind: "enable", addOnId: "template:config:/work/.camunda|mail.json#0" },
        { kind: "disable", addOnId: "template:config:/work/.camunda|mail.json#0" },
        { kind: "removeMarketplace", sourceId: "marketplace:shared" },
        { kind: "enableTemplates", sourceId: "config:/work/.camunda" },
        { kind: "disableTemplates", sourceId: "config:/work/.camunda" },
        { kind: "addMarketplace" },
        { kind: "updateMarketplaces" },
        { kind: "pruneCache" },
        { kind: "refresh" },
    ])("takes a $kind request as it is", (request) => {
        expect(addOnRequestOf(request)).toEqual(request);
    });

    it("drops every field its kind does not name", () => {
        expect(
            addOnRequestOf({
                kind: "revoke",
                addOnId: "plugin:/work/x",
                revision: 3,
                sourceId: "config:/work",
                path: "/etc",
            }),
        ).toEqual({ kind: "revoke", addOnId: "plugin:/work/x" });
    });

    it.each<{ case: string; value: unknown }>([
        { case: "an unknown kind", value: { kind: "deleteEverything", addOnId: "plugin:/work/x" } },
        { case: "a kind that is no string", value: { kind: 1 } },
        { case: "a kind that only reads as a known one", value: { kind: ["refresh"] } },
        { case: "no kind", value: { addOnId: "plugin:/work/x" } },
        { case: "a kind inherited from the prototype", value: { kind: "toString" } },
        { case: "a missing id", value: { kind: "inspect" } },
        { case: "an id that is no string", value: { kind: "revoke", addOnId: 7 } },
        {
            case: "a source id that is no string",
            value: { kind: "removeMarketplace", sourceId: 7 },
        },
        {
            case: "a source id where an add-on id belongs",
            value: { kind: "revoke", sourceId: "s" },
        },
        {
            case: "an allow without a revision",
            value: { kind: "allow", addOnId: "plugin:/work/x" },
        },
        {
            case: "an allow with a revision that is a string",
            value: { kind: "allow", addOnId: "plugin:/work/x", revision: "1" },
        },
        {
            case: "an allow with a fractional revision",
            value: { kind: "allow", addOnId: "plugin:/work/x", revision: 1.5 },
        },
        {
            case: "an allow with a revision beyond a safe integer",
            value: { kind: "allow", addOnId: "plugin:/work/x", revision: 2 ** 53 },
        },
        {
            case: "an allow with an infinite revision",
            value: { kind: "allow", addOnId: "plugin:/work/x", revision: Infinity },
        },
        { case: "null", value: null },
        { case: "an array", value: [{ kind: "refresh" }] },
        { case: "a string", value: "refresh" },
        { case: "nothing", value: undefined },
    ])("refuses $case", ({ value }) => {
        expect(addOnRequestOf(value)).toBeUndefined();
    });
});
