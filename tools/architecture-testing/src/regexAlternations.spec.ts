import { describe, expect, it } from "vitest";

import { readAlternationValues } from "./regexAlternations";

describe("readAlternationValues", () => {
    it.each([
        ["a capturing group", "\\.(spec|test)\\.ts$", [["spec", "test"]]],
        ["a non-capturing group", "^(?:feat|fix)!?:", [["feat", "fix"]]],
        ["a named group", "(?<kind>message|signal)", [["message", "signal"]]],
        ["a lookahead", "x(?!spec|test)", [["spec", "test"]]],
        ["the pattern's own alternatives", "light|dark", [["light", "dark"]]],
        [
            "words with digits, underscores and hyphens",
            "(x64|intel|-p|--project|a_b)",
            [["x64", "intel", "-p", "--project", "a_b"]],
        ],
        [
            "an optional character and a character class, expanded",
            "\\.([mc]?ts|tsx?)$",
            [["ts", "mts", "cts", "ts", "tsx"]],
        ],
        [
            "several groups in the order they open, a nested one inside a group that is no set",
            "((?:get|set)Variable(?:Local)?)|(title|style)",
            [
                ["get", "set"],
                ["title", "style"],
            ],
        ],
    ])("reads %s", (_, pattern, values) => {
        expect(readAlternationValues(pattern)).toEqual(values);
    });

    it.each([
        ["a group without an alternative", "\\.(spec)\\.ts$"],
        ["an alternative with an escape", "(\\.ts|\\.tsx)"],
        ["an escaped bar", "(a\\|b)"],
        ["a bar in a character class", "(a[|]b)"],
        ["an alternative with a quantifier other than ?", "(a+|b)"],
        ["an alternative with a wildcard", "(a.|b)"],
        ["a character class with a range", "([a-z]|b)"],
        ["a negated character class", "([^a]|b)"],
        ["an empty alternative", "(a|)"],
        ["an alternative that can spell nothing", "(s?|x)"],
        ["an anchored top-level alternative", "^light$|^dark$"],
        ["a group holding a group whose alternatives are no words", "(a(?:b+|c)|d)"],
    ])("reads nothing from %s", (_, pattern) => {
        expect(readAlternationValues(pattern)).toEqual([]);
    });

    it("reads nothing from an alternation that spells more than 64 values", () => {
        expect(readAlternationValues(`(${"[ab]?".repeat(6)}x|y)`)).toEqual([]);
        expect(readAlternationValues(`(${"[ab]?".repeat(3)}x|y)`)).toEqual([
            expect.arrayContaining(["x", "ax", "bbbx", "y"]),
        ]);
    });
});
