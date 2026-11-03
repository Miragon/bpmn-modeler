import { describe, expect, it } from "vitest";

import { readPathAliases, resolveAliasImport } from "./pathAliases";

const TSCONFIG = `{
    // tsconfig allows comments and trailing commas
    "compilerOptions": {
        "paths": {
            "@scope/core": ["./libs/core/src/index.ts"],
            "@scope/core/testing": ["./libs/core/src/testing/index.ts"],
            "@scope/panel/*": ["./libs/panel/src/*"],
            "@scope/panel/icons/*": ["./libs/panel/assets/icons/*"],
        },
    },
}`;

describe("readPathAliases", () => {
    it("reads the paths with targets relative to the config's directory", () => {
        expect(readPathAliases(TSCONFIG)).toEqual([
            { pattern: "@scope/core", targets: ["libs/core/src/index.ts"] },
            { pattern: "@scope/core/testing", targets: ["libs/core/src/testing/index.ts"] },
            { pattern: "@scope/panel/*", targets: ["libs/panel/src/*"] },
            { pattern: "@scope/panel/icons/*", targets: ["libs/panel/assets/icons/*"] },
        ]);
    });

    it("reads a config without paths as no aliases", () => {
        expect(readPathAliases('{ "compilerOptions": {} }')).toEqual([]);
    });

    it("throws on a config that is no JSON", () => {
        expect(() => readPathAliases("{ compilerOptions: ")).toThrow("tsconfig paths unreadable");
    });
});

describe("resolveAliasImport", () => {
    const aliases = readPathAliases(TSCONFIG);
    const known = new Set([
        "libs/core/src/index.ts",
        "libs/core/src/testing/index.ts",
        "libs/panel/src/entries/Group.tsx",
        "libs/panel/src/util/index.ts",
        "libs/panel/assets/icons/add.svg",
    ]);

    it.each([
        { specifier: "@scope/core", resolved: "libs/core/src/index.ts" },
        { specifier: "@scope/core/testing", resolved: "libs/core/src/testing/index.ts" },
        { specifier: "@scope/panel/entries/Group", resolved: "libs/panel/src/entries/Group.tsx" },
        { specifier: "@scope/panel/util", resolved: "libs/panel/src/util/index.ts" },
        { specifier: "@scope/panel/icons/add.svg", resolved: "libs/panel/assets/icons/add.svg" },
    ])("resolves $specifier to $resolved", ({ specifier, resolved }) => {
        expect(resolveAliasImport(specifier, aliases, known)).toBe(resolved);
    });

    it.each(["@scope/core/missing", "@scope/panel/missing", "bpmn-js", "@scope/cor"])(
        "leaves %s unresolved",
        (specifier) => {
            expect(resolveAliasImport(specifier, aliases, known)).toBeUndefined();
        },
    );
});
