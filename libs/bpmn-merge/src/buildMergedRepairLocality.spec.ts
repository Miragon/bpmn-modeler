/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { seededRandom } from "./__fixtures__/randomMergeVersions";
import { buildMerged, buildMergedWith } from "./buildMerged";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge, type MergeVersions } from "./computeMerge";
import { layoutModelOf } from "./layoutModelReader";
import { introducedLayoutSpots } from "./layoutSpotDetection";
import { MergeDecisions } from "./mergeDecisions";
import { type MergeSide, otherSide } from "./mergeResult";

/** Fuzz seeds from the design harvest of #2565, each version as `randomMergeVersions` wrote it then. */
const HARVEST = import.meta.glob<string>("./__fixtures__/harvest/*.bpmn", {
    query: "?raw",
    import: "default",
    eager: true,
});

type Strategy = "conflictsToCurrent" | "conflictsToIncoming" | "conflictsAtRandom";

function versionsOf(seed: number): MergeVersions {
    const version = (part: string) => HARVEST[`./__fixtures__/harvest/seed-${seed}.${part}.bpmn`];
    const base = version("base");
    return {
        ...(base === undefined ? {} : { base }),
        current: version("current")!,
        incoming: version("incoming")!,
    };
}

/** Decides every open conflict as the harvest did: for one side, else the other, with its contents when it must. */
async function decisionsOf(versions: MergeVersions, seed: number, strategy: Strategy) {
    const decisions = MergeDecisions.from(await computeMerge(versions));
    const random = seededRandom(seed * 7919);
    const preferredSide = (): MergeSide => {
        if (strategy === "conflictsAtRandom") return random() < 0.5 ? "current" : "incoming";
        return strategy === "conflictsToCurrent" ? "current" : "incoming";
    };
    while (decisions.openConflicts.length > 0) {
        const { id } = decisions.openConflicts[0]!;
        const side = preferredSide();
        const applied =
            decisions.pick(id, side).applied ||
            decisions.pick(id, otherSide(side)).applied ||
            decisions.pickWithContents(id, side).applied ||
            decisions.pickWithContents(id, otherSide(side)).applied;
        expect(applied, id).toBe(true);
    }
    return decisions;
}

async function layoutOf(xml: string) {
    return layoutModelOf((await parseWithoutWarnings(xml)).rootElement);
}

// The harvest results the design prototype changed although no spot was introduced, and four the repair re-routes.
const CASES: readonly { seed: number; strategy: Strategy; repairs: boolean }[] = [
    ...(
        [
            [1, "conflictsAtRandom"],
            [5, "conflictsToCurrent"],
            [20, "conflictsToCurrent"],
            [22, "conflictsToCurrent"],
            [41, "conflictsToCurrent"],
            [50, "conflictsAtRandom"],
            [53, "conflictsToCurrent"],
            [58, "conflictsToIncoming"],
            [71, "conflictsToCurrent"],
            [76, "conflictsToCurrent"],
            [76, "conflictsToIncoming"],
            [78, "conflictsToCurrent"],
            [78, "conflictsToIncoming"],
            [89, "conflictsAtRandom"],
            [96, "conflictsAtRandom"],
            [106, "conflictsToCurrent"],
            [111, "conflictsToIncoming"],
            [116, "conflictsToCurrent"],
            [116, "conflictsToIncoming"],
            [119, "conflictsToCurrent"],
            [119, "conflictsToIncoming"],
            [130, "conflictsToCurrent"],
            [142, "conflictsToCurrent"],
            [144, "conflictsToCurrent"],
            [171, "conflictsToCurrent"],
            [173, "conflictsToCurrent"],
            [192, "conflictsToCurrent"],
        ] as const
    ).map(([seed, strategy]) => ({ seed, strategy, repairs: false })),
    ...(
        [
            [5, "conflictsToIncoming"],
            [74, "conflictsToCurrent"],
            [74, "conflictsToIncoming"],
            [89, "conflictsToIncoming"],
        ] as const
    ).map(([seed, strategy]) => ({ seed, strategy, repairs: true })),
];

describe("the flow repair on harvested merges", () => {
    it.each(CASES)(
        "seed $seed, $strategy: changes only a result with a broken flow and breaks nothing new",
        { timeout: 20_000 },
        async ({ seed, strategy, repairs }) => {
            const versions = versionsOf(seed);
            const sources = await prepareMergeSources(versions);
            const unrepaired = await buildMergedWith(
                sources,
                await decisionsOf(versions, seed, strategy),
                () => [],
            );
            const repaired = await buildMerged(
                sources,
                await decisionsOf(versions, seed, strategy),
            );
            const sides = await Promise.all([versions.current, versions.incoming].map(layoutOf));
            const before = introducedLayoutSpots(await layoutOf(unrepaired.xml), sides);
            const after = introducedLayoutSpots(await layoutOf(repaired.xml), sides);

            if (before.length === 0) expect(repaired.xml).toBe(unrepaired.xml);
            expect(repaired.xml !== unrepaired.xml).toBe(repairs);
            expect(after.filter((spot) => !before.some((known) => sameSpot(known, spot)))).toEqual(
                [],
            );
            expect(after.length).toBeLessThanOrEqual(before.length);
        },
    );
});

function sameSpot(first: object, second: object): boolean {
    return JSON.stringify(first) === JSON.stringify(second);
}
