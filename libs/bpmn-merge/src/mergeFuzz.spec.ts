import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import {
    type Random,
    randomIndex,
    randomItem,
    randomMergeVersions,
    seededRandom,
} from "./__fixtures__/randomMergeVersions";
import { buildMerged } from "./buildMerged";
import { type MergeSources, prepareMergeSources } from "./buildMergedSources";
import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import { MERGE_SIDES, type MergeResult, type MergeSide } from "./mergeResult";

const FIRST_SEED = 1;
const SEED_COUNT = 200;
const END_STATES_PER_SEED = 6;
const WALKS_PER_SEED = 3;
const STEPS_PER_WALK = 8;
/** About 25 s on a developer machine; CI runners are slower. */
const FUZZ_TIMEOUT_MS = 180_000;

type Pick =
    | { readonly kind: "pick"; readonly id: string; readonly side: MergeSide }
    | { readonly kind: "unpick"; readonly id: string };

function stateOf(decisions: MergeDecisions) {
    return {
        sides: decisions.result.elements.map(({ id }) => [
            id,
            decisions.sideOf(id),
            decisions.isInResult(id),
        ]),
        openConflicts: decisions.openConflicts,
        canBuild: decisions.canBuild,
    };
}

function apply(decisions: MergeDecisions, pick: Pick) {
    return pick.kind === "pick" ? decisions.pick(pick.id, pick.side) : decisions.unpick(pick.id);
}

function replayed(result: MergeResult, picks: readonly Pick[]): MergeDecisions {
    const decisions = MergeDecisions.from(result);
    for (const pick of picks) apply(decisions, pick);
    return decisions;
}

function otherSide(side: MergeSide): MergeSide {
    return side === "current" ? "incoming" : "current";
}

/** The build succeeds, parses cleanly and holds exactly the elements the resolution keeps. */
async function expectBuilds(sources: MergeSources, decisions: MergeDecisions, label: string) {
    const resolution = decisions.resolution();
    const { xml } = await buildMerged(sources, decisions).catch((error: unknown) => {
        throw new Error(`${label}: ${String(error)}`, { cause: error });
    });
    const { elementsById } = await parseWithoutWarnings(xml);
    const misplaced = decisions.result.elements
        .filter(({ id, versions }) => {
            const kept = versions[resolution.elements[id]!] !== undefined;
            return kept !== Object.hasOwn(elementsById, id);
        })
        .map(({ id }) => id);
    expect(misplaced, label).toEqual([]);
}

/** Depth first over the first open conflict, as a user would close them, up to a few end states. */
async function expectEndStatesBuild(result: MergeResult, sources: MergeSources, seed: number) {
    const seen = new Set<string>();
    const explore = async (picks: readonly Pick[]): Promise<void> => {
        if (seen.size >= END_STATES_PER_SEED) return;
        const decisions = replayed(result, picks);
        const [first] = decisions.openConflicts;
        if (first === undefined) {
            const key = JSON.stringify(stateOf(decisions));
            if (seen.has(key)) return;
            seen.add(key);
            await expectBuilds(sources, decisions, `seed ${seed}: ${JSON.stringify(picks)}`);
            return;
        }
        const applied = MERGE_SIDES.filter((side) => {
            const branch = replayed(result, picks);
            return branch.pick(first.id, side).applied;
        });
        expect(applied.length, `seed ${seed}: no side of ${first.id} applies`).toBeGreaterThan(0);
        for (const side of applied) await explore([...picks, { kind: "pick", id: first.id, side }]);
    };
    await explore([]);
}

function randomPick(random: Random, decisions: MergeDecisions, picked: readonly string[]): Pick {
    const ids = decisions.result.elements.map(({ id }) => id);
    const open = decisions.openConflicts;
    const side = randomItem(random, MERGE_SIDES)!;
    const roll = random();
    if (roll < 0.4 && open.length > 0) {
        return { kind: "pick", id: open[randomIndex(random, open.length)]!.id, side };
    }
    if (roll < 0.75) return { kind: "pick", id: randomItem(random, ids)!, side };
    return {
        kind: "unpick",
        id:
            (picked.length > 0 && random() < 0.8 ? randomItem(random, picked) : undefined) ??
            randomItem(random, ids)!,
    };
}

/**
 * A refused pick changes nothing; a pick taken back, by the other side and
 * back again or by an unpick, leaves the state as it was; the state after a
 * walk is the state its picks give on a fresh merge; and once its conflicts
 * are closed at random, it builds.
 */
async function expectPathIndependentWalks(
    result: MergeResult,
    sources: MergeSources,
    seed: number,
) {
    const random = seededRandom(seed ^ 0x9e3779b9);
    for (let walk = 0; walk < WALKS_PER_SEED; walk++) {
        const decisions = MergeDecisions.from(result);
        const picks: Pick[] = [];
        for (let step = 0; step < STEPS_PER_WALK; step++) {
            const pick = randomPick(
                random,
                decisions,
                picks.flatMap((made) => (made.kind === "pick" ? [made.id] : [])),
            );
            const label = `seed ${seed}: ${JSON.stringify([...picks, pick])}`;
            const before = stateOf(decisions);
            if (!apply(decisions, pick).applied) {
                expect(stateOf(decisions), `${label} refused`).toEqual(before);
                continue;
            }
            picks.push(pick);
            if (pick.kind === "pick") {
                const afterPick = stateOf(decisions);
                const there = replayed(result, picks);
                if (there.pick(pick.id, otherSide(pick.side)).applied) {
                    expect(there.pick(pick.id, pick.side).applied, label).toBe(true);
                    expect(stateOf(there), `${label} picked back`).toEqual(afterPick);
                }
                if (!wasPicked(picks.slice(0, -1), pick.id)) {
                    const undone = replayed(result, picks);
                    if (undone.unpick(pick.id).applied) {
                        expect(stateOf(undone), `${label} unpicked`).toEqual(before);
                    }
                }
            }
        }
        const finalPicks = finalPicksOf(picks);
        const fresh = MergeDecisions.from(result);
        if (finalPicks.every((pick) => apply(fresh, pick).applied)) {
            expect(
                stateOf(fresh),
                `seed ${seed}: final picks ${JSON.stringify(finalPicks)}`,
            ).toEqual(stateOf(decisions));
        }
        for (let guard = 0; guard < 30 && decisions.openConflicts.length > 0; guard++) {
            const open = decisions.openConflicts;
            const pick: Pick = {
                kind: "pick",
                id: open[randomIndex(random, open.length)]!.id,
                side: randomItem(random, MERGE_SIDES)!,
            };
            if (apply(decisions, pick).applied) picks.push(pick);
        }
        if (decisions.canBuild) {
            await expectBuilds(sources, decisions, `seed ${seed}: ${JSON.stringify(picks)}`);
        }
    }
}

function wasPicked(picks: readonly Pick[], id: string): boolean {
    let picked = false;
    for (const pick of picks) if (pick.id === id) picked = pick.kind === "pick";
    return picked;
}

/** Each id's last pick, in the order the walk last picked them; unpicked ids drop out. */
function finalPicksOf(picks: readonly Pick[]): Pick[] {
    const last = new Map<string, Pick>();
    for (const pick of picks) {
        last.delete(pick.id);
        if (pick.kind === "pick") last.set(pick.id, pick);
    }
    return [...last.values()];
}

describe("random versions of the order process", () => {
    it(
        `merge soundly for seeds ${FIRST_SEED} to ${FIRST_SEED + SEED_COUNT - 1}`,
        async () => {
            for (let seed = FIRST_SEED; seed < FIRST_SEED + SEED_COUNT; seed++) {
                const versions = randomMergeVersions(seed);
                const result = await computeMerge(versions);
                const sources = await prepareMergeSources(versions);
                await expectEndStatesBuild(result, sources, seed);
                await expectPathIndependentWalks(result, sources, seed);
            }
        },
        FUZZ_TIMEOUT_MS,
    );
});
