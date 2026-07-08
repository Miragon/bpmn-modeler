import { describe, expect, it } from "vitest";

import { matchesGlob } from "./glob";

describe("matchesGlob literals and depth", () => {
    it("matches an exact single-segment path", () => {
        expect(matchesGlob("x.json", "x.json")).toBe(true);
        expect(matchesGlob("x.json", "y.json")).toBe(false);
    });

    it("matches an exact multi-segment path", () => {
        expect(matchesGlob("a/b/c.json", "a/b/c.json")).toBe(true);
        expect(matchesGlob("a/b/c.json", "a/b/d.json")).toBe(false);
    });

    it("a pattern without ** matches only its exact depth", () => {
        // No `**`, so the segment count must line up exactly.
        expect(matchesGlob("*.json", "x.json")).toBe(true);
        expect(matchesGlob("*.json", "a/x.json")).toBe(false);
        expect(matchesGlob("a/*.json", "a/x.json")).toBe(true);
        expect(matchesGlob("a/*.json", "x.json")).toBe(false);
    });

    it("is case-sensitive", () => {
        expect(matchesGlob("X.json", "x.json")).toBe(false);
        expect(matchesGlob("A/*.JSON", "A/x.json")).toBe(false);
    });
});

describe("matchesGlob * and ?", () => {
    it("* matches any run within one segment but never crosses /", () => {
        expect(matchesGlob("*.json", "anything.json")).toBe(true);
        expect(matchesGlob("a*b", "aXXXb")).toBe(true);
        expect(matchesGlob("*", "x")).toBe(true); // one segment, any content
        // The empty path is zero segments, so a single non-** segment misses it.
        expect(matchesGlob("*", "")).toBe(false);
        // `*` cannot span the separator, so a nested path stays out of reach.
        expect(matchesGlob("a*", "a/b")).toBe(false);
        expect(matchesGlob("*", "a/b")).toBe(false);
    });

    it("? matches exactly one character and never /", () => {
        expect(matchesGlob("?.json", "x.json")).toBe(true);
        expect(matchesGlob("?.json", "xy.json")).toBe(false);
        expect(matchesGlob("a?b", "a/b")).toBe(false);
    });
});

describe("matchesGlob ** semantics", () => {
    it("** matches any depth including zero segments", () => {
        expect(matchesGlob("**/x.json", "x.json")).toBe(true); // zero segments
        expect(matchesGlob("**/x.json", "a/x.json")).toBe(true);
        expect(matchesGlob("**/x.json", "a/b/c/x.json")).toBe(true);
        expect(matchesGlob("a/**", "a")).toBe(true); // trailing ** absorbs zero
        expect(matchesGlob("a/**", "a/b/c")).toBe(true);
    });

    it("** in the middle spans arbitrary depth", () => {
        expect(matchesGlob("a/**/x.json", "a/x.json")).toBe(true);
        expect(matchesGlob("a/**/x.json", "a/b/c/x.json")).toBe(true);
        expect(matchesGlob("a/**/x.json", "b/x.json")).toBe(false);
    });

    it("collapses consecutive ** to a single one", () => {
        expect(matchesGlob("**/**/x.json", "x.json")).toBe(true);
        expect(matchesGlob("**/**/x.json", "a/b/x.json")).toBe(true);
    });

    it("only an all-** pattern matches the empty path", () => {
        expect(matchesGlob("**", "")).toBe(true);
        expect(matchesGlob("**/**", "")).toBe(true);
        expect(matchesGlob("x.json", "")).toBe(false);
        expect(matchesGlob("**/x.json", "")).toBe(false);
    });
});

describe("matchesGlob camunda/connectors shapes", () => {
    // The pattern the design pins against the live repo; verify the depth 0–3
    // module folders match and the versioned-history / unrelated files don't.
    const pattern = "**/element-templates/*.json";

    it("matches element-templates at any module depth", () => {
        expect(matchesGlob(pattern, "element-templates/a.json")).toBe(true);
        expect(matchesGlob(pattern, "http-json/element-templates/rest.json")).toBe(true);
        expect(
            matchesGlob(pattern, "connectors/aws/aws-lambda/element-templates/lambda.json"),
        ).toBe(true);
    });

    it("excludes versioned history and unrelated json", () => {
        // The final single-`*` segment can't reach into a `versioned/` subfolder.
        expect(matchesGlob(pattern, "http-json/element-templates/versioned/rest-1.json")).toBe(
            false,
        );
        expect(matchesGlob(pattern, "http-json/src/test/resources/fixture.json")).toBe(false);
        expect(matchesGlob(pattern, "pom.json")).toBe(false);
    });
});

describe("matchesGlob is immune to pathological input", () => {
    it("completes on a 200-segment path against a **-heavy pattern", () => {
        const path = Array.from({ length: 200 }, (_, i) => `s${i}`).join("/") + "/x.json";
        const pattern = Array.from({ length: 50 }, () => "**").join("/") + "/x.json";
        // The assertion is really that this returns at all (polynomial, no backtracking).
        expect(matchesGlob(pattern, path)).toBe(true);
    });
});
