import { describe, expect, it } from "vitest";

import { defineFitnessFunction } from "./fitnessFunction";

const findFindings = () => [];

const valid = {
    id: "change-coupling",
    version: 1,
    categories: { scope: "holistic", cadence: "triggered", result: "dynamic" },
    measures: "files that change together across features",
    reliesOn: { skill: "architecture", rule: "a feature changes in one folder" },
    misses: ["coupling through generated files"],
    reportsWrongly: ["a rename as a new coupling"],
    evidence: [{ kind: "trial", commit: "773f8014", outcome: "50 of 200 PRs" }],
    findFindings,
} as const;

describe("the fitness function contract", () => {
    it("accepts a complete definition", () => {
        expect(defineFitnessFunction(valid)).toBe(valid);
    });

    it("accepts declared finding groups", () => {
        const grouped = {
            ...valid,
            groups: [
                { id: "hidden", title: "Hidden" },
                { id: "explained", title: "Explained", collapsed: true },
            ],
        } as const;

        expect(defineFitnessFunction(grouped)).toBe(grouped);
    });

    it("accepts declared finding values", () => {
        const measured = {
            ...valid,
            values: [
                { id: "codeLines", title: "code lines" },
                { id: "complexity", title: "complexity" },
            ],
        } as const;

        expect(defineFitnessFunction(measured)).toBe(measured);
    });

    // Each case is a type error (checked by `typecheck`) and throws for callers that bypass the types.
    it.each([
        {
            case: "a missing field",
            define: () => {
                const { measures: _measures, ...withoutMeasures } = valid;
                // @ts-expect-error measures is required
                return defineFitnessFunction(withoutMeasures);
            },
            problem: "measures is empty",
        },
        {
            case: "an empty text",
            // @ts-expect-error measures must not be empty
            define: () => defineFitnessFunction({ ...valid, measures: "" }),
            problem: "measures is empty",
        },
        {
            case: "an empty nested text",
            define: () =>
                // @ts-expect-error the rule must not be empty
                defineFitnessFunction({ ...valid, reliesOn: { skill: "architecture", rule: "" } }),
            problem: "reliesOn names no skill and rule",
        },
        {
            case: "an empty list of misses",
            // @ts-expect-error misses must list something
            define: () => defineFitnessFunction({ ...valid, misses: [] }),
            problem: "misses lists nothing",
        },
        {
            case: "an empty entry in reportsWrongly",
            // @ts-expect-error an entry must not be empty
            define: () => defineFitnessFunction({ ...valid, reportsWrongly: [""] }),
            problem: "reportsWrongly holds an empty entry",
        },
        {
            case: "no evidence",
            // @ts-expect-error evidence must list something
            define: () => defineFitnessFunction({ ...valid, evidence: [] }),
            problem: "evidence is empty or incomplete",
        },
        {
            case: "evidence without its reference",
            define: () =>
                defineFitnessFunction({
                    ...valid,
                    // @ts-expect-error the reference must not be empty
                    evidence: [{ kind: "published", reference: "" }],
                }),
            problem: "evidence is empty or incomplete",
        },
        {
            case: "an unknown category",
            define: () =>
                defineFitnessFunction({
                    ...valid,
                    // @ts-expect-error scope is atomic or holistic
                    categories: { ...valid.categories, scope: "global" },
                }),
            problem: "categories are incomplete",
        },
    ])("rejects $case", ({ define, problem }) => {
        expect(define).toThrow(problem);
    });

    it.each([
        { case: "a blank text", override: { measures: " " }, problem: "measures is empty" },
        {
            case: "version 0",
            override: { version: 0 },
            problem: "version is not a positive integer",
        },
        {
            case: "a fractional version",
            override: { version: 1.5 },
            problem: "version is not a positive integer",
        },
        {
            case: "an id that is not kebab-case",
            override: { id: "Change_Coupling" },
            problem: "id is not kebab-case",
        },
        {
            case: "a trial without outcome",
            override: { evidence: [{ kind: "trial", commit: "773f8014", outcome: " " }] },
            problem: "evidence is empty or incomplete",
        },
        {
            case: "evidence of an unknown kind",
            override: { evidence: [{ kind: "hunch", reference: "x" }] },
            problem: "evidence is empty or incomplete",
        },
        {
            case: "no findFindings",
            override: { findFindings: undefined },
            problem: "findFindings is missing",
        },
        {
            case: "a blank entry in the misses",
            override: { misses: [" "] },
            problem: "misses holds an empty entry",
        },
        {
            case: "an empty list of groups",
            override: { groups: [] },
            problem: "groups are empty, blank or repeat an id",
        },
        {
            case: "a group with a blank title",
            override: { groups: [{ id: "hidden", title: " " }] },
            problem: "groups are empty, blank or repeat an id",
        },
        {
            case: "a group with a blank id",
            override: { groups: [{ id: "", title: "Hidden" }] },
            problem: "groups are empty, blank or repeat an id",
        },
        {
            case: "two groups with one id",
            override: {
                groups: [
                    { id: "hidden", title: "Hidden" },
                    { id: "hidden", title: "Also hidden" },
                ],
            },
            problem: "groups are empty, blank or repeat an id",
        },
        {
            case: "an empty list of values",
            override: { values: [] },
            problem: "values are empty, blank or repeat an id",
        },
        {
            case: "a value with a blank title",
            override: { values: [{ id: "codeLines", title: "" }] },
            problem: "values are empty, blank or repeat an id",
        },
        {
            case: "two values with one id",
            override: {
                values: [
                    { id: "codeLines", title: "code lines" },
                    { id: "codeLines", title: "lines" },
                ],
            },
            problem: "values are empty, blank or repeat an id",
        },
    ])("rejects $case at run time", ({ override, problem }) => {
        expect(() => defineFitnessFunction({ ...valid, ...override } as never)).toThrow(
            `fitness function ${"id" in override ? override.id : valid.id}: ${problem}`,
        );
    });

    it("names every problem at once", () => {
        expect(() => defineFitnessFunction({ ...valid, measures: " ", version: 0 })).toThrow(
            "version is not a positive integer, measures is empty",
        );
    });
});
