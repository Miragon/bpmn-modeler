import { describe, expect, it } from "vitest";

import { functionReport } from "../../fitness/domain/report";
import { measure } from "../../fitness/service/measurement";
import type { ValueSetOccurrence } from "../domain/repeatedValueSets";
import type { ValueSetSources } from "../port/ValueSetSources";
import { createRepeatedValueSetsFitnessFunction } from "./repeatedValueSetsFitnessFunction";

class InMemoryValueSetSources implements ValueSetSources {
    constructor(
        private readonly occurrencesByRoot: Readonly<Record<string, readonly ValueSetOccurrence[]>>,
    ) {}

    read(repoRoot: string): readonly ValueSetOccurrence[] {
        return this.occurrencesByRoot[repoRoot] ?? [];
    }
}

const AUTH_HOME: ValueSetOccurrence = {
    path: "a/domain/auth.ts",
    line: 1,
    values: ["none", "basic", "oauth2"],
};
const AUTH_COPY: ValueSetOccurrence = {
    path: "b/service/x.ts",
    line: 1,
    values: ["oauth2", "none", "basic"],
};

function reportOf(occurrencesByRoot: Record<string, readonly ValueSetOccurrence[]>) {
    const fitnessFunction = createRepeatedValueSetsFitnessFunction({
        sources: new InMemoryValueSetSources(occurrencesByRoot),
    });
    const head = measure(fitnessFunction, { repoRoot: "head", commit: "head" });
    const base = measure(fitnessFunction, { repoRoot: "base", commit: "base" });
    return functionReport(fitnessFunction, head, { source: "checkout", measurement: base });
}

describe("the repeated value sets fitness function", () => {
    it("marks both occurrences new when the branch adds the copy", () => {
        const report = reportOf({ base: [AUTH_HOME], head: [AUTH_HOME, AUTH_COPY] });

        expect(report.outcome).toEqual({
            kind: "measured",
            findings: [
                expect.objectContaining({ path: "a/domain/auth.ts", line: 1, status: "new" }),
                expect.objectContaining({ path: "b/service/x.ts", line: 1, status: "new" }),
            ],
            resolved: [],
        });
    });

    it("marks both occurrences existing when both files hold the set at the base", () => {
        const report = reportOf({ base: [AUTH_HOME, AUTH_COPY], head: [AUTH_HOME, AUTH_COPY] });

        expect(report.outcome).toEqual({
            kind: "measured",
            findings: [
                expect.objectContaining({ path: "a/domain/auth.ts", status: "existing" }),
                expect.objectContaining({ path: "b/service/x.ts", status: "existing" }),
            ],
            resolved: [],
        });
    });

    it("keeps the other copies existing when the branch removes one of three", () => {
        const thirdCopy: ValueSetOccurrence = { ...AUTH_COPY, path: "c/ui/form.tsx", line: 5 };

        const report = reportOf({
            base: [AUTH_HOME, AUTH_COPY, thirdCopy],
            head: [AUTH_HOME, { ...AUTH_COPY, line: 12 }],
        });

        expect(report.outcome).toEqual({
            kind: "measured",
            findings: [
                expect.objectContaining({ path: "a/domain/auth.ts", status: "existing" }),
                expect.objectContaining({ path: "b/service/x.ts", line: 12, status: "existing" }),
            ],
            resolved: [expect.objectContaining({ path: "c/ui/form.tsx" })],
        });
    });
});
