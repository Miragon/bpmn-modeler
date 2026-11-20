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
import { MERGE_SIDES, type MergeResult, type MergeSide, otherSide } from "./mergeResult";
import { mergePaneView } from "./mergePaneView";
import { idsRemovedWith } from "./removedWith";

const FIRST_SEED = 1;
const SEED_COUNT = 200;
const END_STATES_PER_SEED = 6;
const WALKS_PER_SEED = 3;
const STEPS_PER_WALK = 8;
/** Beyond the range, seeds on which a pick once left its side or an open conflict had no choice. */
const PINNED_SEEDS = [2050, 2557, 2766, 3049, 3357, 3368];
/** Beyond the range, seeds on which one side removes a task with its boundary event and the other keeps them. */
const BOUNDARY_EVENT_SEEDS = [358, 508, 613, 660, 712, 786];
/** Fewer would mean the walks no longer reach the flows a removal took along. */
const MIN_CONNECTIONS_KEPT = 20;
/** Fewer would mean the boundary event seeds no longer offer the boundary events a removal took along. */
const MIN_BOUNDARY_EVENTS_KEPT = 5;
/** Fewer would mean the walks no longer keep a flow that was its source's default. */
const MIN_DEFAULTS_RESTORED = 3;
/** The range runs in chunks, each with its own timeout: 200 seeds in one test took 175 s of 180 s on CI. */
const SEEDS_PER_CHUNK = 50;
/** About 7 s per chunk on a developer machine; CI runners are slower. */
const FUZZ_TIMEOUT_MS = 180_000;

type Pick =
    | {
          readonly kind: "pick" | "pickWithContents";
          readonly id: string;
          readonly side: MergeSide;
      }
    | {
          readonly kind: "pickWithRemoved";
          readonly id: string;
          readonly side: MergeSide;
          /** Captured before the step, since what qualifies depends on the state. */
          readonly connections: readonly string[];
          readonly boundaryEvents: readonly string[];
      }
    | {
          readonly kind: "unpick" | "unpickWithContents" | "unpickWithRemoved";
          readonly id: string;
      };

const UNPICK_OF_SCOPE = {
    element: "unpick",
    withContents: "unpickWithContents",
    withRemoved: "unpickWithRemoved",
} as const;

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
        case "unpickWithRemoved":
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
            case "unpickWithRemoved": {
                const side = sides.get(pick.id);
                if (side === undefined) break;
                sides.delete(pick.id);
                const element = result.elements.find(({ id }) => id === pick.id)!;
                for (const id of idsRemovedWith(result.elements, element, side)) {
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
            case "pickWithRemoved":
                for (const id of offeredWith(pick)) set(id, pick.side);
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

/** The element of a pick with connections and everything it offered. */
function offeredWith(pick: Extract<Pick, { kind: "pickWithRemoved" }>): readonly string[] {
    return [pick.id, ...pick.boundaryEvents, ...pick.connections];
}

interface SeedCounts {
    readonly connectionsKept: number;
    readonly boundaryEventsKept: number;
    readonly defaultsRestored: number;
}

type ParsedElements = Readonly<Record<string, { readonly default?: { readonly id?: string } }>>;

/** The build succeeds, parses cleanly and holds exactly the elements the resolution keeps. */
async function expectBuilds(
    sources: MergeSources,
    decisions: MergeDecisions,
    label: string,
): Promise<{ readonly notes: readonly BuildNote[]; readonly defaultsRestored: number }> {
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
    const defaultsRestored = expectKeptFlowsStayDefaults(
        decisions,
        elementsById as ParsedElements,
        notes,
        label,
    );
    return { notes, defaultsRestored };
}

/**
 * A flow kept against the other side's removal that its source named as its
 * default on the keeping side is that source's default in the built file, or
 * a note names it. Returns how many defaults the build put back.
 */
function expectKeptFlowsStayDefaults(
    decisions: MergeDecisions,
    elementsById: ParsedElements,
    notes: readonly BuildNote[],
    label: string,
): number {
    const { elements: sides } = decisions.resolution();
    const elementsByIdInResult = new Map(
        decisions.result.elements.map((element) => [element.id, element]),
    );
    const property = (reference: { readonly property: string }) =>
        reference.property.slice(reference.property.indexOf("#") + 1);
    let defaultsRestored = 0;
    for (const flow of decisions.result.elements) {
        const side = sides[flow.id]!;
        const { base, [side]: kept, [otherSide(side)]: removed } = flow.versions;
        if (base === undefined || kept === undefined || removed !== undefined) continue;
        for (const { target: source } of kept.references.filter(
            (ref) => property(ref) === "sourceRef",
        )) {
            const namedOnKeptSide = elementsByIdInResult
                .get(source)
                ?.versions[side]?.references.some(
                    (ref) => property(ref) === "default" && ref.target === flow.id,
                );
            if (!namedOnKeptSide || elementsById[source] === undefined) continue;
            const builtDefault = elementsById[source]?.default?.id;
            const noted = notes.some(
                (note) =>
                    note.kind === "defaultFlowNotRestored" &&
                    note.id === source &&
                    note.flow === flow.id,
            );
            expect(
                builtDefault === flow.id || noted,
                `${label}: ${source} keeps ${flow.id} as its default or a note names it`,
            ).toBe(true);
            if (builtDefault === flow.id && sides[source] !== side) defaultsRestored += 1;
        }
    }
    return defaultsRestored;
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
            const offered = decisions.removedWithLeftOut(kept.id, kept.side);
            return { kind: "pickWithRemoved", ...kept, ...offered };
        }
    }
    if (roll < 0.45 && open.length > 0) {
        return { kind: "pick", id: open[randomIndex(random, open.length)]!.id, side };
    }
    if (roll < 0.78) return { kind: "pick", id: randomItem(random, ids)!, side };
    const unpickRoll = random();
    return {
        kind:
            unpickRoll < 0.2
                ? "unpickWithContents"
                : unpickRoll < 0.4
                  ? "unpickWithRemoved"
                  : "unpick",
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
    pick: Extract<Pick, { kind: "pickWithRemoved" }>,
    decisions: MergeDecisions,
    before: ReturnType<typeof stateOf>,
    label: string,
) {
    const oneByOne = replayed(result, prefix);
    const plainApplied = offeredWith(pick).every((id) => oneByOne.pick(id, pick.side).applied);
    expect(plainApplied, `${label} one by one applied`).toBe(true);
    expect(stateOf(oneByOne), `${label} one by one`).toEqual(stateOf(decisions));
    const picksBefore = picksLeftBy(result, prefix);
    const element = result.elements.find(({ id }) => id === pick.id)!;
    // It takes back everything the other side removed with the element, what was picked by hand too.
    const takenBack = idsRemovedWith(result.elements, element, pick.side);
    if ([pick.id, ...takenBack].every((id) => !picksBefore.has(id))) {
        const undone = replayed(result, [...prefix, pick]);
        if (undone.unpickWithRemoved(pick.id).applied) {
            expect(stateOf(undone), `${label} unpicked with connections`).toEqual(before);
        }
    }
}

/** A connection or boundary event still kept with its element is never noted as missing from it. */
function expectNoRestoredConnectionNoted(
    picks: readonly Pick[],
    decisions: MergeDecisions,
    notes: readonly BuildNote[],
    label: string,
) {
    const pickedOn = (id: string, side: MergeSide) =>
        decisions.originOf(id) === "picked" && decisions.sideOf(id) === side;
    for (const pick of picks) {
        if (pick.kind !== "pickWithRemoved" || !pickedOn(pick.id, pick.side)) continue;
        const kept = offeredWith(pick).filter((id) => pickedOn(id, pick.side));
        const noted = notes.flatMap((note) =>
            note.kind === "restoredWithoutRemovedWith" && note.id === pick.id
                ? [...note.connections, ...(note.boundaryEvents ?? [])].filter((id) =>
                      kept.includes(id),
                  )
                : [],
        );
        expect(noted, `${label}: connections kept with ${pick.id} noted`).toEqual([]);
    }
}

/**
 * Each pane badges or lists every user pick exactly once; a pick badged with
 * everything inside has every element inside picked on its side; and the
 * Undo the panes offer for the element the step touched applies and takes
 * its pick back.
 */
function expectPanesShowEveryPick(
    result: MergeResult,
    sources: MergeSources,
    picks: readonly Pick[],
    decisions: MergeDecisions,
    label: string,
) {
    const picked = decisions.result.elements
        .map(({ id }) => id)
        .filter((id) => decisions.originOf(id) === "picked")
        .sort();
    const views = MERGE_SIDES.map(
        (side) => [side, mergePaneView(decisions, side, sources)] as const,
    );
    for (const [side, view] of views) {
        const shown = [...view.badges, ...view.picksNotDrawn];
        expect(shown.map(({ id }) => id).sort(), `${label}: picks on ${side}'s pane`).toEqual(
            picked,
        );
        const notAllInside = shown
            .filter(({ scope }) => scope === "withContents")
            .filter(({ id, keptSide }) =>
                descendantsOf(id, result.elements).some(
                    (inside) =>
                        decisions.originOf(inside) !== "picked" ||
                        decisions.sideOf(inside) !== keptSide,
                ),
            );
        expect(notAllInside, `${label}: with everything inside on ${side}'s pane`).toEqual([]);
        const pickableById = new Map(view.pickable.map((entry) => [entry.id, entry]));
        for (const { id, scope } of shown) {
            expect(pickableById.get(id)?.undo, `${label}: ${id}'s undo on ${side}'s pane`).toBe(
                scope,
            );
        }
        for (const row of view.shapelessRows) {
            const pickable = pickableById.get(row.id);
            expect(row.pick?.scope, `${label}: ${row.id}'s row on ${side}'s pane`).toBe(
                pickable?.undo,
            );
            expect(row.handMergeable, `${label}: ${row.id}'s row on ${side}'s pane`).toBe(
                pickable?.handMergeable,
            );
        }
    }
    const touched = picks[picks.length - 1]?.id;
    const undo = views[0][1].pickable.find(({ id }) => id === touched)?.undo;
    if (touched === undefined || undo === undefined) return;
    const undone = replayed(result, picks);
    expect(undone[UNPICK_OF_SCOPE[undo]](touched).applied, `${label}: undo ${touched}`).toBe(true);
    expect(undone.originOf(touched), `${label}: ${touched} after its undo`).not.toBe("picked");
}

/**
 * Both contracts hold after every applied step; a refused pick changes
 * nothing; a pick taken back, by the other side and back again or by an
 * unpick, leaves the state as it was; the state after a walk is the state its
 * picks give on a fresh merge; and once its conflicts are closed at random,
 * it builds.
 */
/** Counts the applied steps that kept an element with at least one connection, and the defaults the builds put back. */
async function expectPathIndependentWalks(
    result: MergeResult,
    sources: MergeSources,
    seed: number,
): Promise<SeedCounts> {
    let connectionsKept = 0;
    let defaultsRestored = 0;
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
            expectPanesShowEveryPick(result, sources, picks, decisions, label);
            if (pick.kind === "pickWithRemoved") {
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
            const built = await expectBuilds(sources, decisions, label);
            expectNoRestoredConnectionNoted(picks, decisions, built.notes, label);
            defaultsRestored += built.defaultsRestored;
        }
    }
    return { connectionsKept, boundaryEventsKept: 0, defaultsRestored };
}

/**
 * The picks the walk leaves as plain picks, in the order it last picked them:
 * a pick with contents or connections may resolve to other elements on a
 * fresh merge.
 */
function finalPicksOf(result: MergeResult, picks: readonly Pick[]): Pick[] {
    return [...picksLeftBy(result, picks)].map(([id, side]) => ({ kind: "pick", id, side }));
}

/**
 * Every offer that keeps a boundary event, taken on a fresh merge: the
 * contracts hold, it equals the plain picks, Undo takes it back, and once
 * its conflicts are closed at random, it builds. Returns how many there are.
 */
async function expectBoundaryEventOffersKept(
    result: MergeResult,
    sources: MergeSources,
    seed: number,
): Promise<number> {
    let offers = 0;
    const random = seededRandom(seed ^ 0x85ebca6b);
    for (const { id } of result.elements) {
        for (const side of MERGE_SIDES) {
            const decisions = MergeDecisions.from(result);
            const offered = decisions.removedWithLeftOut(id, side);
            if (offered.boundaryEvents.length === 0) continue;
            const pick: Pick = { kind: "pickWithRemoved", id, side, ...offered };
            const label = `seed ${seed}: ${JSON.stringify(pick)}`;
            const before = stateOf(decisions);
            expect(apply(decisions, pick).applied, label).toBe(true);
            offers += 1;
            const picks: Pick[] = [pick];
            expectContracts(result, picks, decisions, label);
            expectPanesShowEveryPick(result, sources, picks, decisions, label);
            expectConnectionsKeptAsPicks(result, [], pick, decisions, before, label);
            for (let guard = 0; guard < 30 && decisions.openConflicts.length > 0; guard++) {
                const open = decisions.openConflicts;
                const close: Pick = {
                    kind: "pick",
                    id: open[randomIndex(random, open.length)]!.id,
                    side: randomItem(random, MERGE_SIDES)!,
                };
                if (apply(decisions, close).applied) picks.push(close);
            }
            if (decisions.canBuild) {
                const built = await expectBuilds(sources, decisions, label);
                expectNoRestoredConnectionNoted(picks, decisions, built.notes, label);
            }
        }
    }
    return offers;
}

async function expectMergesSoundly(seed: number): Promise<SeedCounts> {
    const versions = randomMergeVersions(seed);
    const result = await computeMerge(versions);
    const sources = await prepareMergeSources(versions);
    await expectEndStatesBuild(result, sources, seed);
    const boundaryEventsKept = await expectBoundaryEventOffersKept(result, sources, seed);
    const walks = await expectPathIndependentWalks(result, sources, seed);
    return { ...walks, boundaryEventsKept };
}

describe("random versions of the order process", () => {
    let connectionsKept = 0;
    let defaultsRestored = 0;
    for (
        let chunkStart = FIRST_SEED;
        chunkStart < FIRST_SEED + SEED_COUNT;
        chunkStart += SEEDS_PER_CHUNK
    ) {
        const chunkEnd = Math.min(chunkStart + SEEDS_PER_CHUNK, FIRST_SEED + SEED_COUNT) - 1;
        it(
            `merge soundly for seeds ${chunkStart} to ${chunkEnd}`,
            async () => {
                for (let seed = chunkStart; seed <= chunkEnd; seed++) {
                    const counts = await expectMergesSoundly(seed);
                    connectionsKept += counts.connectionsKept;
                    defaultsRestored += counts.defaultsRestored;
                }
            },
            FUZZ_TIMEOUT_MS,
        );
    }

    it(`reach kept connections and restored defaults over seeds ${FIRST_SEED} to ${FIRST_SEED + SEED_COUNT - 1}`, () => {
        expect(
            connectionsKept,
            "walks that kept an element with its connections",
        ).toBeGreaterThanOrEqual(MIN_CONNECTIONS_KEPT);
        expect(
            defaultsRestored,
            "builds that put a kept flow back as its source's default",
        ).toBeGreaterThanOrEqual(MIN_DEFAULTS_RESTORED);
    });

    it(`merge soundly for the seeds ${PINNED_SEEDS.join(", ")}`, async () => {
        for (const seed of PINNED_SEEDS) await expectMergesSoundly(seed);
    });

    it(`keep the boundary events removed with a task for the seeds ${BOUNDARY_EVENT_SEEDS.join(", ")}`, async () => {
        let boundaryEventsKept = 0;
        for (const seed of BOUNDARY_EVENT_SEEDS) {
            boundaryEventsKept += (await expectMergesSoundly(seed)).boundaryEventsKept;
        }
        expect(
            boundaryEventsKept,
            "offers that kept a task with its boundary events",
        ).toBeGreaterThanOrEqual(MIN_BOUNDARY_EVENTS_KEPT);
    });
});
