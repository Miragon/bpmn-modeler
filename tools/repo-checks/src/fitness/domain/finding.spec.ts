import { describe, expect, it } from "vitest";

import { parseFindings, sortFindings } from "./finding";

const VALID = { key: "k", path: "src/a.ts", line: 1, message: "m" };

describe("the findings a fitness function returns", () => {
    it.each([
        { case: "no list", output: undefined, problem: "returned no list of findings" },
        { case: "no object", output: ["text"], problem: "finding 0 is not an object" },
        { case: "no key", output: [{ ...VALID, key: " " }], problem: "finding 0 has no key" },
        { case: "no path", output: [{ ...VALID, path: "" }], problem: "finding 0 has no path" },
        {
            case: "an absolute path",
            output: [{ ...VALID, path: "/tmp/fitness-x/src/a.ts" }],
            problem: "not one relative to the repository root",
        },
        {
            case: "a Windows path",
            output: [{ ...VALID, path: "src\\a.ts" }],
            problem: "not one relative to the repository root",
        },
        { case: "line 0", output: [{ ...VALID, line: 0 }], problem: "has line 0" },
        { case: "a fractional line", output: [{ ...VALID, line: 1.5 }], problem: "has line 1.5" },
        { case: "no message", output: [{ ...VALID, message: "" }], problem: "has no message" },
    ])("are broken input when they hold $case", ({ output, problem }) => {
        expect(() => parseFindings("fitness function x", output)).toThrow(problem);
    });

    it("keeps only the finding's fields", () => {
        expect(parseFindings("x", [{ ...VALID, extra: true }])).toEqual([VALID]);
    });

    it.each([
        {
            case: "a group the function does not declare",
            output: [{ ...VALID, group: "other" }],
            groups: ["hidden"],
            problem: "finding 0 has group other, which the function does not declare",
        },
        {
            case: "a group from a function that declares none",
            output: [{ ...VALID, group: "hidden" }],
            groups: [],
            problem: "finding 0 has group hidden, which the function does not declare",
        },
        {
            case: "no group from a function that declares groups",
            output: [VALID],
            groups: ["hidden"],
            problem: "finding 0 has no group",
        },
    ])("are broken input when they hold $case", ({ output, groups, problem }) => {
        expect(() => parseFindings("fitness function x", output, { groups, values: [] })).toThrow(
            problem,
        );
    });

    it("keep a declared group", () => {
        const grouped = { ...VALID, group: "hidden" };

        expect(
            parseFindings("x", [grouped], { groups: ["explained", "hidden"], values: [] }),
        ).toEqual([grouped]);
    });

    it("of a stored snapshot keep whatever group they name", () => {
        const grouped = { ...VALID, group: "retired" };

        expect(parseFindings("snapshot", [grouped, VALID], undefined)).toEqual([grouped, VALID]);
    });

    it.each([
        {
            case: "a value the function does not declare",
            output: [{ ...VALID, values: { lines: 3 } }],
            values: ["codeLines"],
            problem: "finding 0 has value lines, which the function does not declare",
        },
        {
            case: "a value from a function that declares none",
            output: [{ ...VALID, values: { codeLines: 3 } }],
            values: [],
            problem: "finding 0 has value codeLines, which the function does not declare",
        },
        {
            case: "a value that is no finite number",
            output: [{ ...VALID, values: { codeLines: Number.NaN } }],
            values: ["codeLines"],
            problem: "finding 0 has value codeLines NaN, not a finite number",
        },
        {
            case: "values that are no record",
            output: [{ ...VALID, values: [3] }],
            values: ["codeLines"],
            problem: "finding 0 has values that are no record of numbers",
        },
        {
            case: "rank 0",
            output: [{ ...VALID, rank: 0 }],
            values: [],
            problem: "finding 0 has rank 0, not a positive integer",
        },
    ])("are broken input when they hold $case", ({ output, values, problem }) => {
        expect(() => parseFindings("fitness function x", output, { groups: [], values })).toThrow(
            problem,
        );
    });

    it("keep declared values, a missing one included, and a rank", () => {
        const measured = { ...VALID, values: { complexity: 4 }, rank: 2 };

        expect(
            parseFindings("x", [measured], { groups: [], values: ["codeLines", "complexity"] }),
        ).toEqual([measured]);
    });

    it("of a stored snapshot keep whatever values they name", () => {
        const measured = { ...VALID, values: { retired: 1 } };

        expect(parseFindings("snapshot", [measured])).toEqual([measured]);
    });

    it("of a stored snapshot are still broken input with a value that is no number", () => {
        expect(() => parseFindings("snapshot", [{ ...VALID, values: { lines: "3" } }])).toThrow(
            "finding 0 has value lines 3, not a finite number",
        );
    });

    it("store their values in id order", () => {
        const [parsed] = parseFindings("snapshot", [{ ...VALID, values: { b: 1, a: 2 } }]);

        expect(Object.keys(parsed.values ?? {})).toEqual(["a", "b"]);
    });

    it.each([
        {
            case: "paths that are no list",
            output: [{ ...VALID, key: "src/a.ts", paths: "src/a.ts" }],
            problem:
                "finding 0 has paths that are no list of paths relative to the repository root",
        },
        {
            case: "no paths in their list",
            output: [{ ...VALID, paths: [] }],
            problem:
                "finding 0 has paths that are no list of paths relative to the repository root",
        },
        {
            case: "an absolute path among their paths",
            output: [{ ...VALID, key: "/repo/src/a.ts", paths: ["/repo/src/a.ts"] }],
            problem:
                "finding 0 has paths that are no list of paths relative to the repository root",
        },
        {
            case: "paths their key does not name",
            output: [{ ...VALID, key: "src/a.ts — Save", paths: ["src/b.ts"] }],
            problem: "finding 0 has paths its key does not name in their order",
        },
        {
            case: "paths their key names in another order",
            output: [{ ...VALID, key: "src/a.ts → src/b.ts", paths: ["src/b.ts", "src/a.ts"] }],
            problem: "finding 0 has paths its key does not name in their order",
        },
        {
            case: "a path order but no paths",
            output: [{ ...VALID, pathOrder: "code-unit" }],
            problem: "finding 0 has a path order but no paths",
        },
        {
            case: "a path order the engine does not know",
            output: [{ ...VALID, key: "src/a.ts", paths: ["src/a.ts"], pathOrder: "length" }],
            problem: "finding 0 has path order length, not code-unit",
        },
        {
            case: "paths out of the code-unit order they declare",
            output: [
                {
                    ...VALID,
                    key: "src/b.ts ↔ src/a.ts",
                    paths: ["src/b.ts", "src/a.ts"],
                    pathOrder: "code-unit",
                },
            ],
            problem: "finding 0 has paths out of code-unit order",
        },
    ])("are broken input when they hold $case", ({ output, problem }) => {
        expect(() => parseFindings("fitness function x", output)).toThrow(problem);
    });

    it("keep the paths their key names and the order it names them in", () => {
        const pair = {
            ...VALID,
            key: "src/a.ts ↔ src/b.ts",
            paths: ["src/a.ts", "src/b.ts"],
            pathOrder: "code-unit",
        };

        expect(parseFindings("x", [pair])).toEqual([pair]);
    });

    it.each([
        {
            case: "path",
            left: { ...VALID, path: "src/b.ts" },
            right: { ...VALID, path: "src/a.ts" },
        },
        { case: "line", left: { ...VALID, line: 10 }, right: { ...VALID, line: 9 } },
        { case: "key", left: { ...VALID, key: "b" }, right: { ...VALID, key: "a" } },
        { case: "message", left: { ...VALID, message: "b" }, right: { ...VALID, message: "a" } },
    ])("sort by $case", ({ left, right }) => {
        expect(sortFindings([left, right])).toEqual([right, left]);
        expect(sortFindings([right, left])).toEqual([right, left]);
    });

    it("sort upper case before lower case, whatever the locale", () => {
        const lower = { ...VALID, path: "src/a.ts" };
        const upper = { ...VALID, path: "src/B.ts" };

        expect(sortFindings([lower, upper])).toEqual([upper, lower]);
    });
});
