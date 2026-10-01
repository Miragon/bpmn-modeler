import { describe, expect, it } from "vitest";

import { UnresolvedEnvVariableError } from "../../shared/domain/errors";
import {
    blankIfWholeEnvRef,
    expandEnvRefs,
    expandEnvRefsLeniently,
    expandOptionalEnvRefs,
    isWholeEnvRef,
} from "./envRef";

const lookup = (map: Record<string, string>) => (name: string) => map[name];

describe("expandEnvRefs", () => {
    it("returns a value without refs unchanged", () => {
        const value = "https://camunda.example/engine-rest";
        expect(expandEnvRefs(value, lookup({}), "endpoint")).toBe(value);
    });

    it("expands multiple refs inside one value", () => {
        expect(
            expandEnvRefs(
                "https://camunda.${env:STAGE}.${env:REGION}/rest",
                lookup({
                    STAGE: "prod",
                    REGION: "eu",
                }),
                "endpoint",
            ),
        ).toBe("https://camunda.prod.eu/rest");
    });

    it("leaves malformed refs (invalid variable names) untouched", () => {
        const value = "${env:1BAD} ${env:} ${notenv:X}";
        expect(expandEnvRefs(value, lookup({}), "endpoint")).toBe(value);
    });

    it("throws naming the variable and field when a matched ref is unset", () => {
        expect(() => expandEnvRefs("${env:CAMUNDA_PASSWORD}", lookup({}), "password")).toThrow(
            UnresolvedEnvVariableError,
        );
        try {
            expandEnvRefs("${env:CAMUNDA_PASSWORD}", lookup({}), "password");
        } catch (error) {
            expect((error as UnresolvedEnvVariableError).variable).toBe("CAMUNDA_PASSWORD");
            expect((error as UnresolvedEnvVariableError).field).toBe("password");
        }
    });
});

describe("expandOptionalEnvRefs", () => {
    it("passes undefined through", () => {
        expect(expandOptionalEnvRefs(undefined, lookup({}), "deployUrl")).toBeUndefined();
    });
});

describe("expandEnvRefsLeniently", () => {
    it("expands known refs and keeps unknown ones verbatim", () => {
        expect(expandEnvRefsLeniently("${env:A}-${env:B}", lookup({ A: "a" }))).toBe("a-${env:B}");
    });
});

describe("blankIfWholeEnvRef", () => {
    it("blanks a whole ref and keeps literals and partial interpolation", () => {
        expect(blankIfWholeEnvRef("${env:P}")).toBe("");
        expect(blankIfWholeEnvRef("secret")).toBe("secret");
        expect(blankIfWholeEnvRef("x-${env:P}")).toBe("x-${env:P}");
    });
});

describe("isWholeEnvRef", () => {
    it("accepts a value that is exactly one ref, trimming surrounding space", () => {
        expect(isWholeEnvRef("${env:TOKEN}")).toBe(true);
        expect(isWholeEnvRef("  ${env:TOKEN}  ")).toBe(true);
    });

    it("rejects partial interpolation and literals", () => {
        expect(isWholeEnvRef("user-${env:TOKEN}")).toBe(false);
        expect(isWholeEnvRef("plain-secret")).toBe(false);
        expect(isWholeEnvRef("${env:A}${env:B}")).toBe(false);
    });
});
