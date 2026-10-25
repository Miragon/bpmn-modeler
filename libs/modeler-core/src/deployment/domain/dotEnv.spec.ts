import { describe, expect, it } from "vitest";

import { parseDotEnv } from "./dotEnv";

describe("parseDotEnv", () => {
    it("parses simple KEY=VALUE lines", () => {
        expect(parseDotEnv("A=1\nB=two")).toEqual(
            new Map([
                ["A", "1"],
                ["B", "two"],
            ]),
        );
    });

    it("ignores blank lines and # comments", () => {
        expect(parseDotEnv("# comment\n\nA=1\n   # indented comment\nB=2")).toEqual(
            new Map([
                ["A", "1"],
                ["B", "2"],
            ]),
        );
    });

    it("strips an optional leading export", () => {
        expect(parseDotEnv("export TOKEN=abc")).toEqual(new Map([["TOKEN", "abc"]]));
    });

    it("strips matching single or double quotes", () => {
        expect(parseDotEnv(`A="quoted"\nB='single'\nC=un"even`)).toEqual(
            new Map([
                ["A", "quoted"],
                ["B", "single"],
                ["C", `un"even`],
            ]),
        );
    });

    it("tolerates CRLF line endings", () => {
        expect(parseDotEnv("A=1\r\nB=2\r\n")).toEqual(
            new Map([
                ["A", "1"],
                ["B", "2"],
            ]),
        );
    });

    it("keeps empty values", () => {
        expect(parseDotEnv("EMPTY=")).toEqual(new Map([["EMPTY", ""]]));
    });

    it("returns a Map, so keys like __proto__ stay plain entries", () => {
        const variables = parseDotEnv("__proto__=x\nconstructor=y");

        expect(variables).toBeInstanceOf(Map);
        expect(variables.get("__proto__")).toBe("x");
        expect(variables.get("constructor")).toBe("y");
        expect(variables.get("toString")).toBeUndefined();
    });

    it("lets a later assignment of the same key win", () => {
        expect(parseDotEnv("A=1\nA=2")).toEqual(new Map([["A", "2"]]));
    });
});
