import { describe, expect, expectTypeOf, it } from "vitest";

import {
    ADD_ON_ACTION_KINDS,
    ADD_ON_KINDS,
    type AddOnActionKind,
    type AddOnKind,
    CATALOG_ACTION_KINDS,
    type CatalogActionKind,
    CODE_ADD_ON_KINDS,
    type CodeAddOnKind,
    addOnIdOf,
    folderGroupIdOf,
    MARKETPLACES_GROUP_ID,
    SOURCE_ACTION_KINDS,
    SOURCE_KINDS,
    type SourceActionKind,
    type SourceKind,
    sourceIdOf,
    TEMPLATE_STATES,
    templateAddOnIdOf,
    type TemplateState,
} from "./addOnIds";

describe("action kinds", () => {
    it("names what a row and the catalog offer", () => {
        expectTypeOf<AddOnActionKind>().toEqualTypeOf<(typeof ADD_ON_ACTION_KINDS)[number]>();
        expectTypeOf<SourceActionKind>().toEqualTypeOf<(typeof SOURCE_ACTION_KINDS)[number]>();
        expectTypeOf<CatalogActionKind>().toEqualTypeOf<(typeof CATALOG_ACTION_KINDS)[number]>();
        expect([ADD_ON_ACTION_KINDS, SOURCE_ACTION_KINDS, CATALOG_ACTION_KINDS]).toEqual([
            ["inspect", "allow", "revoke"],
            ["removeMarketplace"],
            ["addMarketplace", "updateMarketplaces", "pruneCache"],
        ]);
    });
});

describe("add-on ids", () => {
    it("names each kind of add-on and of source", () => {
        expectTypeOf<AddOnKind>().toEqualTypeOf<(typeof ADD_ON_KINDS)[number]>();
        expectTypeOf<CodeAddOnKind>().toEqualTypeOf<(typeof CODE_ADD_ON_KINDS)[number]>();
        expectTypeOf<SourceKind>().toEqualTypeOf<(typeof SOURCE_KINDS)[number]>();
        expectTypeOf<TemplateState>().toEqualTypeOf<(typeof TEMPLATE_STATES)[number]>();
        expect([ADD_ON_KINDS, CODE_ADD_ON_KINDS, SOURCE_KINDS, TEMPLATE_STATES]).toEqual([
            ["plugin", "rulePackage", "elementTemplate"],
            ["plugin", "rulePackage"],
            ["configFolder", "installedPackages", "marketplace"],
            ["enabled"],
        ]);
    });

    it.each([
        { id: addOnIdOf("plugin", "/work/p"), expected: "plugin:/work/p" },
        { id: addOnIdOf("rulePackage", "/work/r"), expected: "rulePackage:/work/r" },
        { id: sourceIdOf("configFolder", "/work/.camunda"), expected: "config:/work/.camunda" },
        {
            id: sourceIdOf("installedPackages", "/work/node_modules"),
            expected: "packages:/work/node_modules",
        },
        { id: folderGroupIdOf("/work"), expected: "folder:/work" },
        { id: sourceIdOf("marketplace", "acme-shared"), expected: "marketplace:acme-shared" },
        { id: MARKETPLACES_GROUP_ID, expected: "marketplaces" },
        {
            id: templateAddOnIdOf("/t/mail.json", { id: "mail", version: 3 }, 0),
            expected: "template:/t/mail.json#mail@3",
        },
        {
            id: templateAddOnIdOf("/t/mail.json", { id: "mail" }, 1),
            expected: "template:/t/mail.json#mail",
        },
        {
            id: templateAddOnIdOf("/t/mail.json", { version: 2 }, 1),
            expected: "template:/t/mail.json#1@2",
        },
        { id: templateAddOnIdOf("/t/broken.json"), expected: "template:/t/broken.json" },
    ])("spells $expected", ({ id, expected }) => {
        expect(id).toBe(expected);
    });
});
