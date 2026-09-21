import { describe, expect, it } from "vitest";

import { UnresolvedEnvVariableError } from "../../shared/domain/errors";
import { expandEnvRefs, isWholeEnvRef } from "./envRef";

const lookup = (map: Record<string, string>) => (name: string) => map[name];

describe("expandEnvRefs", () => {
    it("returns the same string instance when there is no ref", () => {
        const value = "https://camunda.example/engine-rest";
        expect(expandEnvRefs(value, lookup({}))).toBe(value);
    });

    it("expands multiple refs inside one value", () => {
        expect(
            expandEnvRefs(
                "https://camunda.${env:STAGE}.${env:REGION}/rest",
                lookup({
                    STAGE: "prod",
                    REGION: "eu",
                }),
            ),
        ).toBe("https://camunda.prod.eu/rest");
    });

    it("leaves malformed refs (invalid variable names) untouched", () => {
        const value = "${env:1BAD} ${env:} ${notenv:X}";
        expect(expandEnvRefs(value, lookup({}))).toBe(value);
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
