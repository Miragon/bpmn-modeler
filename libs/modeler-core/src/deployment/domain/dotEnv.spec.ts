import { describe, expect, it } from "vitest";

import { parseDotEnv } from "./dotEnv";

describe("parseDotEnv", () => {
    it("parses simple KEY=VALUE lines", () => {
        expect(parseDotEnv("A=1\nB=two")).toEqual({ A: "1", B: "two" });
    });

    it("ignores blank lines and # comments", () => {
        expect(parseDotEnv("# comment\n\nA=1\n   # indented comment\nB=2")).toEqual({
            A: "1",
            B: "2",
        });
    });

    it("strips an optional leading export", () => {
        expect(parseDotEnv("export TOKEN=abc")).toEqual({ TOKEN: "abc" });
    });

    it("strips matching single or double quotes", () => {
        expect(parseDotEnv(`A="quoted"\nB='single'\nC=un"even`)).toEqual({
            A: "quoted",
            B: "single",
            C: `un"even`,
        });
    });

    it("tolerates CRLF line endings", () => {
        expect(parseDotEnv("A=1\r\nB=2\r\n")).toEqual({ A: "1", B: "2" });
    });

    it("keeps empty values", () => {
        expect(parseDotEnv("EMPTY=")).toEqual({ EMPTY: "" });
    });

    it("lets a later assignment of the same key win", () => {
        expect(parseDotEnv("A=1\nA=2")).toEqual({ A: "2" });
    });
});
