import { describe, expect, expectTypeOf, it } from "vitest";

import {
    ADD_ON_KINDS,
    type AddOnKind,
    addOnIdOf,
    folderGroupIdOf,
    SOURCE_KINDS,
    type SourceKind,
    sourceIdOf,
} from "./addOnIds";

describe("add-on ids", () => {
    it("names each kind of add-on and of source", () => {
        expectTypeOf<AddOnKind>().toEqualTypeOf<(typeof ADD_ON_KINDS)[number]>();
        expectTypeOf<SourceKind>().toEqualTypeOf<(typeof SOURCE_KINDS)[number]>();
        expect([ADD_ON_KINDS, SOURCE_KINDS]).toEqual([
            ["plugin", "rulePackage"],
            ["configFolder", "installedPackages"],
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
    ])("spells $expected", ({ id, expected }) => {
        expect(id).toBe(expected);
    });
});
