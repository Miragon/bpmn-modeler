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
        expect(() => parseFindings("fitness function x", output, groups)).toThrow(problem);
    });

    it("keep a declared group", () => {
        const grouped = { ...VALID, group: "hidden" };

        expect(parseFindings("x", [grouped], ["explained", "hidden"])).toEqual([grouped]);
    });

    it("of a stored snapshot keep whatever group they name", () => {
        const grouped = { ...VALID, group: "retired" };

        expect(parseFindings("snapshot", [grouped, VALID], undefined)).toEqual([grouped, VALID]);
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
