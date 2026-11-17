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
import { descendantsOf } from "./mergeDecisionsContainment";
import { MERGE_SIDES, type MergeResult, type MergeSide } from "./mergeResult";

const FIRST_SEED = 1;
const SEED_COUNT = 200;
const END_STATES_PER_SEED = 6;
const WALKS_PER_SEED = 3;
const STEPS_PER_WALK = 8;
/** Beyond the range, seeds on which a pick once left its side or an open conflict had no choice. */
const PINNED_SEEDS = [2050, 2557, 2766, 3049, 3357, 3368];
/** About 25 s on a developer machine; CI runners are slower. */
const FUZZ_TIMEOUT_MS = 180_000;

type Pick =
    | {
          readonly kind: "pick" | "pickWithContents";
          readonly id: string;
          readonly side: MergeSide;
      }
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
    return pick.kind === "unpick"
        ? decisions.unpick(pick.id)
        : decisions[pick.kind](pick.id, pick.side);
}

function replayed(result: MergeResult, picks: readonly Pick[]): MergeDecisions {
    const decisions = MergeDecisions.from(result);
    for (const pick of picks) apply(decisions, pick);
    return decisions;
}

/** Contract A: an applied pick leaves the element on the picked side until it is picked again or unpicked. */
function expectPicksOnTheirSide(decisions: MergeDecisions, picks: readonly Pick[], label: string) {
    const sides = new Map<string, MergeSide>();
    for (const pick of picks) {
        if (pick.kind === "unpick") {
            sides.delete(pick.id);
            continue;
        }
        const descendants =
            pick.kind === "pick" ? [] : descendantsOf(pick.id, decisions.result.elements);
        for (const id of [pick.id, ...descendants]) sides.set(id, pick.side);
    }
    const offTheirSide = [...sides]
        .filter(([id, side]) => decisions.sideOf(id) !== side)
        .map(([id]) => id);
    expect(offTheirSide, `${label}: picks off their side`).toEqual([]);
}

/** A plain pick of either side first, as a user would try it. */
const CHOICES = (["pick", "pickWithContents"] as const).flatMap((kind) =>
    MERGE_SIDES.map((side) => ({ kind, side })),
);

/** Contract B: every open conflict keeps a choice that applies. */
function expectAChoiceForEveryConflict(
    result: MergeResult,
    picks: readonly Pick[],
    decisions: MergeDecisions,
    label: string,
) {
    const deadEnds = decisions.openConflicts
        .map(({ id }) => id)
        .filter(
            (id) =>
                !CHOICES.some(({ kind, side }) => replayed(result, picks)[kind](id, side).applied),
        );
    expect(deadEnds, `${label}: open conflicts without a choice`).toEqual([]);
}

/** Both contracts hold in the state the picks lead to. */
function expectContracts(
    result: MergeResult,
    picks: readonly Pick[],
    decisions: MergeDecisions,
    label: string,
) {
    expectPicksOnTheirSide(decisions, picks, label);
    expectAChoiceForEveryConflict(result, picks, decisions, label);
}

function otherSide(side: MergeSide): MergeSide {
    return side === "current" ? "incoming" : "current";
}

/** The build succeeds, parses cleanly and holds exactly the elements the resolution keeps. */
async function expectBuilds(sources: MergeSources, decisions: MergeDecisions, label: string) {
    const resolution = decisions.resolution();
    const { xml } = await buildMerged(sources, decisions).catch((error: unknown) => {
        throw new Error(`${label}: ${String(error)}`);
    });
    const { elementsById } = await parseWithoutWarnings(xml);
    const misplaced = decisions.result.elements
        .filter(({ id, versions }) => {
            const kept = versions[resolution.elements[id]!] !== undefined;
            return kept !== Object.prototype.hasOwnProperty.call(elementsById, id);
        })
        .map(({ id }) => id);
    expect(misplaced, label).toEqual([]);
}

/**
 * Depth first over the first open conflict, as a user would close them, up to
 * a few end states; a pick with contents only where no plain pick applies.
 */
async function expectEndStatesBuild(result: MergeResult, sources: MergeSources, seed: number) {
    const seen = new Set<string>();
    const explore = async (picks: readonly Pick[]): Promise<void> => {
        if (seen.size >= END_STATES_PER_SEED) return;
        const decisions = replayed(result, picks);
        expectContracts(result, picks, decisions, `seed ${seed}: ${JSON.stringify(picks)}`);
        const [first] = decisions.openConflicts;
        if (first === undefined) {
            const key = JSON.stringify(stateOf(decisions));
            if (seen.has(key)) return;
            seen.add(key);
            await expectBuilds(sources, decisions, `seed ${seed}: ${JSON.stringify(picks)}`);
            return;
        }
        const applying = CHOICES.map(({ kind, side }): Pick => ({
            kind,
            id: first.id,
            side,
        })).filter((choice) => apply(replayed(result, picks), choice).applied);
        const plain = applying.filter(({ kind }) => kind === "pick");
        for (const choice of plain.length > 0 ? plain : applying) {
            await explore([...picks, choice]);
        }
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
 * Both contracts hold after every applied step; a refused pick changes
 * nothing; a pick taken back, by the other side and back again or by an
 * unpick, leaves the state as it was; the state after a walk is the state its
 * picks give on a fresh merge; and once its conflicts are closed at random,
 * it builds.
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
            expectContracts(result, picks, decisions, label);
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
            if (apply(decisions, pick).applied) {
                picks.push(pick);
                expectContracts(result, picks, decisions, `seed ${seed}: ${JSON.stringify(picks)}`);
            }
        }
        if (decisions.canBuild) {
            await expectBuilds(sources, decisions, `seed ${seed}: ${JSON.stringify(picks)}`);
        }
    }
}

function wasPicked(picks: readonly Pick[], id: string): boolean {
    let picked = false;
    for (const pick of picks) if (pick.id === id) picked = pick.kind !== "unpick";
    return picked;
}

/** Each id's last pick, in the order the walk last picked them; unpicked ids drop out. */
function finalPicksOf(picks: readonly Pick[]): Pick[] {
    const last = new Map<string, Pick>();
    for (const pick of picks) {
        last.delete(pick.id);
        if (pick.kind !== "unpick") last.set(pick.id, pick);
    }
    return [...last.values()];
}

async function expectMergesSoundly(seed: number) {
    const versions = randomMergeVersions(seed);
    const result = await computeMerge(versions);
    const sources = await prepareMergeSources(versions);
    await expectEndStatesBuild(result, sources, seed);
    await expectPathIndependentWalks(result, sources, seed);
}

describe("random versions of the order process", () => {
    it(
        `merge soundly for seeds ${FIRST_SEED} to ${FIRST_SEED + SEED_COUNT - 1}`,
        async () => {
            for (let seed = FIRST_SEED; seed < FIRST_SEED + SEED_COUNT; seed++) {
                await expectMergesSoundly(seed);
            }
        },
        FUZZ_TIMEOUT_MS,
    );

    it(`merge soundly for the seeds ${PINNED_SEEDS.join(", ")}`, async () => {
        for (const seed of PINNED_SEEDS) await expectMergesSoundly(seed);
    });
});
