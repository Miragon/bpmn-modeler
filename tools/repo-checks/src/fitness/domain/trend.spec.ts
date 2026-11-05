import { describe, expect, it } from "vitest";

import type { Finding } from "./finding";
import { emptySnapshot, withEntry } from "./snapshot";
import { findingTrends, type StoredFindings, storedFindingsOf } from "./trend";

const HEAD = "head";

function file(key: string, values: Record<string, number>): Finding {
    return { key, path: key, line: 1, message: `${key} measured`, values };
}

function lines(codeLines: number, key = "src/a.ts"): Finding {
    return file(key, { codeLines });
}

function stored(commit: string, ...findings: Finding[]): StoredFindings {
    return { commit, findings };
}

function trendOf(
    headFindings: readonly Finding[],
    storedNewestFirst: readonly StoredFindings[],
    maxChanges?: number,
) {
    return findingTrends({ commit: HEAD, findings: headFindings }, storedNewestFirst, maxChanges);
}

describe("the trend of a finding's values", () => {
    it("rises over two snapshots in which a file grows", () => {
        const trends = trendOf([lines(348)], [stored("c2", lines(330)), stored("c1", lines(300))]);

        expect(trends.get("src/a.ts")).toEqual([
            { commit: "c1", values: { codeLines: 300 } },
            { commit: "c2", values: { codeLines: 330 } },
            { commit: HEAD, values: { codeLines: 348 } },
        ]);
    });

    it("collapses equal values into the oldest commit holding them", () => {
        const trends = trendOf(
            [lines(330)],
            [stored("c3", lines(330)), stored("c2", lines(330)), stored("c1", lines(300))],
        );

        expect(trends.get("src/a.ts")).toEqual([
            { commit: "c1", values: { codeLines: 300 } },
            { commit: "c2", values: { codeLines: 330 } },
        ]);
    });

    it("skips a commit without a usable measurement and dates the change to the stored commit that shows it", () => {
        const trends = trendOf(
            [lines(330)],
            [stored("c3", lines(330)), { commit: "c2" }, stored("c1", lines(300))],
        );

        expect(trends.get("src/a.ts")).toEqual([
            { commit: "c1", values: { codeLines: 300 } },
            { commit: "c3", values: { codeLines: 330 } },
        ]);
    });

    it("ends a key's series at the first commit that lacks it", () => {
        const trends = trendOf(
            [lines(348)],
            [stored("c3", lines(330)), stored("c2"), stored("c1", lines(300))],
        );

        expect(trends.get("src/a.ts")).toEqual([
            { commit: "c3", values: { codeLines: 330 } },
            { commit: HEAD, values: { codeLines: 348 } },
        ]);
    });

    it("tells a value apart from a missing one", () => {
        const trends = trendOf(
            [file("src/a.ts", { codeLines: 3, complexity: 1 })],
            [stored("c1", file("src/a.ts", { codeLines: 3 }))],
        );

        expect(trends.get("src/a.ts")).toEqual([
            { commit: "c1", values: { codeLines: 3 } },
            { commit: HEAD, values: { codeLines: 3, complexity: 1 } },
        ]);
    });

    it("keeps the newest changes and the point before them", () => {
        const trends = trendOf(
            [lines(5)],
            [
                stored("c4", lines(4)),
                stored("c3", lines(3)),
                stored("c2", lines(2)),
                stored("c1", lines(1)),
            ],
            2,
        );

        expect(trends.get("src/a.ts")?.map(({ commit }) => commit)).toEqual(["c3", "c4", HEAD]);
    });

    it("dates the oldest kept point to the oldest commit holding its values", () => {
        const trends = trendOf(
            [lines(5)],
            [stored("c3", lines(4)), stored("c2", lines(4)), stored("c1", lines(1))],
            1,
        );

        expect(trends.get("src/a.ts")?.map(({ commit }) => commit)).toEqual(["c2", HEAD]);
    });

    it("gives a key that repeats at HEAD no trend", () => {
        expect(trendOf([lines(1), lines(2)], [stored("c1", lines(1))]).has("src/a.ts")).toBe(false);
    });

    it("ends a key's series where it repeats", () => {
        const trends = trendOf(
            [lines(3)],
            [stored("c2", lines(2)), stored("c1", lines(1), lines(1))],
        );

        expect(trends.get("src/a.ts")).toEqual([
            { commit: "c2", values: { codeLines: 2 } },
            { commit: HEAD, values: { codeLines: 3 } },
        ]);
    });

    it("follows each key on its own", () => {
        const trends = trendOf(
            [lines(2, "a.ts"), lines(7, "b.ts")],
            [stored("c1", lines(1, "a.ts"), lines(7, "b.ts"))],
        );

        expect(trends.get("a.ts")).toHaveLength(2);
        expect(trends.get("b.ts")).toEqual([{ commit: "c1", values: { codeLines: 7 } }]);
    });
});

describe("the stored findings of a function", () => {
    const sizes = { id: "size", version: 2 };

    it("hold a measured entry of the function's version and nothing for any other commit", () => {
        const snapshots = new Map([
            ["c3", withEntry(emptySnapshot("c3"), "size", { version: 2, findings: [lines(3)] })],
            ["c2", withEntry(emptySnapshot("c2"), "size", { version: 1, findings: [lines(2)] })],
            [
                "c1",
                withEntry(emptySnapshot("c1"), "size", { version: 2, unmeasurable: "no history" }),
            ],
        ]);

        expect(storedFindingsOf(["c4", "c3", "c2", "c1"], snapshots, sizes)).toEqual([
            { commit: "c4" },
            { commit: "c3", findings: [lines(3)] },
            { commit: "c2" },
            { commit: "c1" },
        ]);
    });
});
