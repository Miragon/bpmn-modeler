import { describe, expect, it } from "vitest";

import { readValueSets } from "./valueSets";

describe("readValueSets", () => {
    it.each([
        [
            "an array literal",
            'const types = ["none", "basic", `oauth2`];',
            ["none", "basic", "oauth2"],
        ],
        ["a union of string literal types", 'type Mode = "light" | "dark";', ["light", "dark"]],
        [
            "an || chain on one subject, either side, in parentheses",
            'if (type === "none" || ("basic" === type || (type === "oauth2"))) {}',
            ["none", "basic", "oauth2"],
        ],
        [
            "an || chain on a property access",
            'const isTheme = (o) => o.mode === "light" || o.mode === "dark";',
            ["light", "dark"],
        ],
        ["a single string in an array", 'const one = ["only"];', ["only"]],
    ])("reads %s", (_, source, values) => {
        expect(readValueSets("source.ts", source)).toEqual([{ line: 1, values }]);
    });

    it.each([
        ["an empty array", "const none = [];"],
        ["a mixed array", 'const mixed = ["a", 1];'],
        ["an array with a spread", 'const spread = ["a", ...rest];'],
        ["an array with an interpolated template", "const t = [`a`, `${b}`];"],
        ["a union with another member", 'type T = "a" | "b" | undefined;'],
        ["an || chain on two subjects", 'const x = a === "a" || b === "b";'],
        ["an || chain with another operand", 'const x = a === "a" || isB(a);'],
        ["an || chain comparing two strings", 'const x = "a" === "a" || "b" === "b";'],
        ["an || chain comparing two subjects", 'const x = a === b || a === "x";'],
        ["an || chain with !==", 'const x = a !== "a" || a !== "b";'],
        ["an && chain", 'const x = a === "a" && a === "b";'],
        ["a set in a comment", '// const types = ["none", "basic"];\n/* type T = "a" | "b"; */'],
        ["a set in a string", 'const text = \'x === "a" || x === "b"; ["none", "basic"]\';'],
    ])("reads nothing from %s", (_, source) => {
        expect(readValueSets("source.ts", source)).toEqual([]);
    });

    it("reads the sets in source order with their lines, a nested chain once", () => {
        const source = [
            'type Theme = "light" | "dark";',
            "function check(x) {",
            '    return x === "a" ||',
            '        (x === "b" || x === "c");',
            "}",
            'export const LEVELS = ["info", "error"];',
        ].join("\n");

        expect(readValueSets("source.ts", source)).toEqual([
            { line: 1, values: ["light", "dark"] },
            { line: 3, values: ["a", "b", "c"] },
            { line: 6, values: ["info", "error"] },
        ]);
    });

    it("reads a set nested in another construct", () => {
        const source =
            'const config = { modes: ["light", "dark"], check: (m) => m === "x" || m === "y" };';

        expect(readValueSets("source.ts", source)).toEqual([
            { line: 1, values: ["light", "dark"] },
            { line: 1, values: ["x", "y"] },
        ]);
    });

    it("reads an .mjs script and a .tsx file", () => {
        expect(readValueSets("build.mjs", 'const LOCALES = ["de", "en"];')).toEqual([
            { line: 1, values: ["de", "en"] },
        ]);
        expect(readValueSets("View.tsx", 'const view = <Select options={["a", "b"]} />;')).toEqual([
            { line: 1, values: ["a", "b"] },
        ]);
    });
});
