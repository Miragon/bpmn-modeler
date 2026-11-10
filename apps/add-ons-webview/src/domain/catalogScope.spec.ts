import type { AddOnCatalogPayload } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import { CATALOG, MAIL, RESIZE } from "../__fixtures__/catalogs";
import {
    CatalogScope,
    isCatalogScope,
    scopeAfterKey,
    scopedCatalog,
    scopeOfAddOn,
} from "./catalogScope";

const LOCKED_FOLDER = {
    id: "folder:/locked",
    kind: "folder",
    label: "locked",
    description: "/locked",
    problem: "Could not read the folder.",
    sources: [],
} as const;

const UNREADABLE_MARKETPLACES = {
    id: "marketplaces",
    kind: "marketplaces",
    label: "Marketplaces",
    description: "Element templates fetched from the registered marketplaces",
    problem: "Could not read the marketplaces.",
    sources: [],
} as const;

const model: AddOnCatalogPayload = {
    ...CATALOG,
    emptyText: "None.",
    groups: [...CATALOG.groups, LOCKED_FOLDER],
};

const idsOf = (scoped: AddOnCatalogPayload) => scoped.groups.map(({ id }) => id);

describe("scopedCatalog", () => {
    it("keeps the folders, one without sources included, in the workspace tab", () => {
        expect(idsOf(scopedCatalog(model, "workspace"))).toEqual([
            "folder:/work",
            "folder:/locked",
        ]);
    });

    it("keeps the marketplaces group in its own tab", () => {
        expect(idsOf(scopedCatalog(model, "marketplaces"))).toEqual(["marketplaces"]);
    });

    it("places a marketplaces group by its kind, even with only a problem", () => {
        const unreadable = { ...CATALOG, groups: [CATALOG.groups[0]!, UNREADABLE_MARKETPLACES] };

        expect([
            idsOf(scopedCatalog(unreadable, "workspace")),
            idsOf(scopedCatalog(unreadable, "marketplaces")),
        ]).toEqual([["folder:/work"], ["marketplaces"]]);
    });

    it("keeps the rest of the catalog", () => {
        expect(scopedCatalog(model, "marketplaces")).toMatchObject({
            revision: CATALOG.revision,
            emptyText: "None.",
            actions: CATALOG.actions,
        });
    });
});

describe("scopeOfAddOn", () => {
    it.each([
        [RESIZE.id, "workspace"],
        [MAIL.id, "marketplaces"],
        ["template:unknown", undefined],
    ])("places %s in %s", (id, expected) => {
        expect(scopeOfAddOn(model, id)).toBe(expected);
    });
});

describe("scopeAfterKey", () => {
    it.each<[string, CatalogScope, CatalogScope | undefined]>([
        ["ArrowRight", "workspace", "marketplaces"],
        ["ArrowRight", "marketplaces", "workspace"],
        ["ArrowLeft", "workspace", "marketplaces"],
        ["ArrowLeft", "marketplaces", "workspace"],
        ["Home", "marketplaces", "workspace"],
        ["End", "workspace", "marketplaces"],
        ["ArrowDown", "workspace", undefined],
        ["Enter", "workspace", undefined],
    ])("moves %s from %s to %s", (key, current, expected) => {
        expect(scopeAfterKey(key, current)).toBe(expected);
    });
});

describe("isCatalogScope", () => {
    it.each([
        ["workspace", true],
        ["marketplaces", true],
        ["folder", false],
        [undefined, false],
        [3, false],
    ])("is %s a tab: %s", (value, expected) => {
        expect(isCatalogScope(value)).toBe(expected);
    });
});
