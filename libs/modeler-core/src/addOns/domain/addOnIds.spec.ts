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
    GROUP_KINDS,
    type GroupKind,
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
            ["allow", "revoke", "enable", "disable"],
            ["removeMarketplace", "enableTemplates", "disableTemplates"],
            ["addMarketplace", "updateMarketplaces", "pruneCache"],
        ]);
    });
});

describe("add-on ids", () => {
    it("names each kind of add-on, of source and of group", () => {
        expectTypeOf<AddOnKind>().toEqualTypeOf<(typeof ADD_ON_KINDS)[number]>();
        expectTypeOf<CodeAddOnKind>().toEqualTypeOf<(typeof CODE_ADD_ON_KINDS)[number]>();
        expectTypeOf<SourceKind>().toEqualTypeOf<(typeof SOURCE_KINDS)[number]>();
        expectTypeOf<GroupKind>().toEqualTypeOf<(typeof GROUP_KINDS)[number]>();
        expectTypeOf<TemplateState>().toEqualTypeOf<(typeof TEMPLATE_STATES)[number]>();
        expect([
            ADD_ON_KINDS,
            CODE_ADD_ON_KINDS,
            SOURCE_KINDS,
            GROUP_KINDS,
            TEMPLATE_STATES,
        ]).toEqual([
            ["plugin", "rulePackage", "elementTemplate"],
            ["plugin", "rulePackage"],
            ["configFolder", "installedPackages", "marketplace"],
            ["folder", "marketplaces"],
            ["enabled", "disabled"],
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
            id: templateAddOnIdOf("config:/t", "/t/mail.json", { id: "mail", version: 3 }, 0),
            expected: "template:config:/t|/t/mail.json#0:mail@3",
        },
        {
            id: templateAddOnIdOf("config:/t", "/t/mail.json", { id: "mail" }, 1),
            expected: "template:config:/t|/t/mail.json#1:mail",
        },
        {
            id: templateAddOnIdOf("config:/t", "/t/mail.json", { version: 2 }, 1),
            expected: "template:config:/t|/t/mail.json#1@2",
        },
        {
            id: templateAddOnIdOf("config:/t", "/t/broken.json"),
            expected: "template:config:/t|/t/broken.json",
        },
    ])("spells $expected", ({ id, expected }) => {
        expect(id).toBe(expected);
    });

    it("tells every template of one file apart, whatever ids they declare", () => {
        const ids = [
            templateAddOnIdOf("config:/t", "/t/mail.json", { id: "1" }, 0),
            templateAddOnIdOf("config:/t", "/t/mail.json", {}, 1),
            templateAddOnIdOf("config:/t", "/t/mail.json", { id: "mail", version: 2 }, 2),
            templateAddOnIdOf("config:/t", "/t/mail.json", { id: "mail", version: 2 }, 3),
        ];

        expect(new Set(ids).size).toBe(ids.length);
    });
});
