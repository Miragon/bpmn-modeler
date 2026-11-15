import { describe, expect, it } from "vitest";

import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import {
    type Random,
    randomIndex,
    randomItem,
    randomMergeVersions,
    seededRandom,
} from "./__fixtures__/randomMergeVersions";
import { type BuildNote, buildMerged } from "./buildMerged";
import { type MergeSources, prepareMergeSources } from "./buildMergedSources";
import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import { descendantsOf } from "./mergeDecisionsContainment";
import { MERGE_SIDES, type MergeResult, type MergeSide } from "./mergeResult";
import { connectionsRemovedWith } from "./removedConnections";

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
    | {
          readonly kind: "pickWithConnections";
          readonly id: string;
          readonly side: MergeSide;
          /** Captured before the step, since which flows qualify depends on the state. */
          readonly connections: readonly string[];
      }
    | { readonly kind: "unpick" | "unpickWithContents"; readonly id: string };

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
    switch (pick.kind) {
        case "unpick":
        case "unpickWithContents":
            return decisions[pick.kind](pick.id);
        default:
            return decisions[pick.kind](pick.id, pick.side);
    }
}

function replayed(result: MergeResult, picks: readonly Pick[]): MergeDecisions {
    const decisions = MergeDecisions.from(result);
    for (const pick of picks) apply(decisions, pick);
    return decisions;
}

/** The user's picks the applied steps leave, each id at the place of its last pick. */
function picksLeftBy(result: MergeResult, picks: readonly Pick[]): Map<string, MergeSide> {
    const sides = new Map<string, MergeSide>();
    const set = (id: string, side: MergeSide) => {
        sides.delete(id);
        sides.set(id, side);
    };
    for (const pick of picks) {
        switch (pick.kind) {
            case "unpick":
                sides.delete(pick.id);
                break;
            case "unpickWithContents": {
                const side = sides.get(pick.id);
                if (side === undefined) break;
                sides.delete(pick.id);
                for (const id of descendantsOf(pick.id, result.elements)) {
                    if (sides.get(id) === side) sides.delete(id);
                }
                break;
            }
            case "pick":
                set(pick.id, pick.side);
                break;
            case "pickWithContents":
                for (const id of [pick.id, ...descendantsOf(pick.id, result.elements)]) {
                    set(id, pick.side);
                }
                break;
            case "pickWithConnections":
                for (const id of [pick.id, ...pick.connections]) set(id, pick.side);
                break;
        }
    }
    return sides;
}

/** Contract A: an applied pick leaves the element on the picked side until it is picked again or unpicked. */
function expectPicksOnTheirSide(decisions: MergeDecisions, picks: readonly Pick[], label: string) {
    const sides = picksLeftBy(decisions.result, picks);
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
async function expectBuilds(
    sources: MergeSources,
    decisions: MergeDecisions,
    label: string,
): Promise<readonly BuildNote[]> {
    const resolution = decisions.resolution();
    const { xml, notes } = await buildMerged(sources, decisions).catch((error: unknown) => {
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
    return notes;
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

/** An element exactly one side removed, kept on the side that holds it. */
function removedByOneSide(
    random: Random,
    decisions: MergeDecisions,
): { readonly id: string; readonly side: MergeSide } | undefined {
    const removed = decisions.result.elements.flatMap(({ id, versions }) => {
        const holding = MERGE_SIDES.filter((side) => versions[side] !== undefined);
        return versions.base !== undefined && holding.length === 1
            ? [{ id, side: holding[0]! }]
            : [];
    });
    return randomItem(random, removed);
}

function randomPick(random: Random, decisions: MergeDecisions, picked: readonly string[]): Pick {
    const ids = decisions.result.elements.map(({ id }) => id);
    const open = decisions.openConflicts;
    const side = randomItem(random, MERGE_SIDES)!;
    const roll = random();
    if (roll < 0.1) {
        const kept = removedByOneSide(random, decisions);
        if (kept !== undefined) {
            const connections = decisions.connectionsLeftOut(kept.id, kept.side);
            return { kind: "pickWithConnections", ...kept, connections };
        }
    }
    if (roll < 0.45 && open.length > 0) {
        return { kind: "pick", id: open[randomIndex(random, open.length)]!.id, side };
    }
    if (roll < 0.78) return { kind: "pick", id: randomItem(random, ids)!, side };
    return {
        kind: random() < 0.25 ? "unpickWithContents" : "unpick",
        id:
            (picked.length > 0 && random() < 0.8 ? randomItem(random, picked) : undefined) ??
            randomItem(random, ids)!,
    };
}

/**
 * Keeping an element with its connections is the plain pick followed by a
 * pick of each flow, and taking it back with them restores the state before
 * it when none of what it takes back was picked before.
 */
function expectConnectionsKeptAsPicks(
    result: MergeResult,
    prefix: readonly Pick[],
    pick: Extract<Pick, { kind: "pickWithConnections" }>,
    decisions: MergeDecisions,
    before: ReturnType<typeof stateOf>,
    label: string,
) {
    const oneByOne = replayed(result, prefix);
    const plainApplied = [pick.id, ...pick.connections].every(
        (id) => oneByOne.pick(id, pick.side).applied,
    );
    if (plainApplied) expect(stateOf(oneByOne), `${label} one by one`).toEqual(stateOf(decisions));
    const picksBefore = picksLeftBy(result, prefix);
    const element = result.elements.find(({ id }) => id === pick.id)!;
    // It takes back every flow the other side removed with the element, a flow picked by hand too.
    const takenBack = connectionsRemovedWith(result.elements, element, pick.side).map(
        ({ id }) => id,
    );
    if ([pick.id, ...takenBack].every((id) => !picksBefore.has(id))) {
        const undone = replayed(result, [...prefix, pick]);
        if (undone.unpickWithConnections(pick.id).applied) {
            expect(stateOf(undone), `${label} unpicked with connections`).toEqual(before);
        }
    }
}

/** A connection still kept with its element is never noted as missing from it. */
function expectNoRestoredConnectionNoted(
    picks: readonly Pick[],
    decisions: MergeDecisions,
    notes: readonly BuildNote[],
    label: string,
) {
    const pickedOn = (id: string, side: MergeSide) =>
        decisions.originOf(id) === "picked" && decisions.sideOf(id) === side;
    for (const pick of picks) {
        if (pick.kind !== "pickWithConnections" || !pickedOn(pick.id, pick.side)) continue;
        const kept = pick.connections.filter((id) => pickedOn(id, pick.side));
        const noted = notes.flatMap((note) =>
            note.kind === "restoredWithoutConnections" && note.id === pick.id
                ? note.connections.filter((id) => kept.includes(id))
                : [],
        );
        expect(noted, `${label}: connections kept with ${pick.id} noted`).toEqual([]);
    }
}

/**
 * Both contracts hold after every applied step; a refused pick changes
 * nothing; a pick taken back, by the other side and back again or by an
 * unpick, leaves the state as it was; the state after a walk is the state its
 * picks give on a fresh merge; and once its conflicts are closed at random,
 * it builds.
 */
/** Returns how many applied steps kept an element with at least one connection. */
async function expectPathIndependentWalks(
    result: MergeResult,
    sources: MergeSources,
    seed: number,
): Promise<number> {
    let connectionsKept = 0;
    const random = seededRandom(seed ^ 0x9e3779b9);
    for (let walk = 0; walk < WALKS_PER_SEED; walk++) {
        const decisions = MergeDecisions.from(result);
        const picks: Pick[] = [];
        for (let step = 0; step < STEPS_PER_WALK; step++) {
            const pick = randomPick(
                random,
                decisions,
                picks.flatMap((made) => (made.kind.startsWith("pick") ? [made.id] : [])),
            );
            const label = `seed ${seed}: ${JSON.stringify([...picks, pick])}`;
            const before = stateOf(decisions);
            if (!apply(decisions, pick).applied) {
                expect(stateOf(decisions), `${label} refused`).toEqual(before);
                continue;
            }
            picks.push(pick);
            expectContracts(result, picks, decisions, label);
            if (pick.kind === "pickWithConnections") {
                if (pick.connections.length > 0) connectionsKept += 1;
                expectConnectionsKeptAsPicks(
                    result,
                    picks.slice(0, -1),
                    pick,
                    decisions,
                    before,
                    label,
                );
            }
            if (pick.kind === "pick") {
                const afterPick = stateOf(decisions);
                const there = replayed(result, picks);
                if (there.pick(pick.id, otherSide(pick.side)).applied) {
                    expect(there.pick(pick.id, pick.side).applied, label).toBe(true);
                    expect(stateOf(there), `${label} picked back`).toEqual(afterPick);
                }
                if (!picksLeftBy(result, picks.slice(0, -1)).has(pick.id)) {
                    const undone = replayed(result, picks);
                    if (undone.unpick(pick.id).applied) {
                        expect(stateOf(undone), `${label} unpicked`).toEqual(before);
                    }
                }
            }
        }
        const finalPicks = finalPicksOf(result, picks);
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
            const label = `seed ${seed}: ${JSON.stringify(picks)}`;
            const notes = await expectBuilds(sources, decisions, label);
            expectNoRestoredConnectionNoted(picks, decisions, notes, label);
        }
    }
    return connectionsKept;
}

/**
 * The picks the walk leaves as plain picks, in the order it last picked them:
 * a pick with contents or connections may resolve to other elements on a
 * fresh merge.
 */
function finalPicksOf(result: MergeResult, picks: readonly Pick[]): Pick[] {
    return [...picksLeftBy(result, picks)].map(([id, side]) => ({ kind: "pick", id, side }));
}

async function expectMergesSoundly(seed: number): Promise<number> {
    const versions = randomMergeVersions(seed);
    const result = await computeMerge(versions);
    const sources = await prepareMergeSources(versions);
    await expectEndStatesBuild(result, sources, seed);
    return expectPathIndependentWalks(result, sources, seed);
}

describe("random versions of the order process", () => {
    it(
        `merge soundly for seeds ${FIRST_SEED} to ${FIRST_SEED + SEED_COUNT - 1}`,
        async () => {
            let connectionsKept = 0;
            for (let seed = FIRST_SEED; seed < FIRST_SEED + SEED_COUNT; seed++) {
                connectionsKept += await expectMergesSoundly(seed);
            }
            expect(
                connectionsKept,
                "walks that kept an element with its connections",
            ).toBeGreaterThan(0);
        },
        FUZZ_TIMEOUT_MS,
    );

    it(`merge soundly for the seeds ${PINNED_SEEDS.join(", ")}`, async () => {
        for (const seed of PINNED_SEEDS) await expectMergesSoundly(seed);
    });
});
