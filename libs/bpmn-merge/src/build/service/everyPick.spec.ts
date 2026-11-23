import { describe, expect, it } from "vitest";

import {
    ALL_CONFLICTS_SCENARIO,
    MERGE_SCENARIOS,
    PLATFORM_ONLY_SCENARIO,
    scenarioNamed,
} from "../../__fixtures__/mergeScenarios";
import { parseWithoutWarnings } from "../../__fixtures__/parseWithoutWarnings";
import { acceptHandMerge } from "./acceptHandMerge";
import { buildMerged } from "./buildMerged";
import type { MergeSources } from "../../sources/domain/mergeSources";
import { prepareMergeSources } from "../../sources/service/buildMergedSources";
import { computeMerge, type MergeVersions } from "../../classify/service/computeMerge";
import { MergeDecisions, type MergeResolution } from "../../decide/domain/mergeDecisions";
import {
    MERGE_SIDES,
    type ElementState,
    type MergeResult,
    type MergeSide,
} from "../../kernel/domain/mergeResult";

type Pick = { readonly id: string; readonly side: MergeSide; readonly withContents?: boolean };

const SIDES = MERGE_SIDES;
const MAX_PICKS = 16;
/** Drawn by their plane, not by a shape or an edge. */
const PLANE_OWNER_TYPES = new Set(["bpmn:Collaboration", "bpmn:Process"]);

interface EndState {
    readonly resolution: MergeResolution;
    readonly picks: readonly Pick[];
}

interface Exploration {
    readonly endStates: Map<string, EndState>;
    blockedPicks: number;
    deadEnds: string[];
}

/** Resolved automatically although the versions differ, so a user may override the resolution. */
const OVERRIDABLE_STATES: ReadonlySet<ElementState> = new Set<ElementState>([
    "takenFromCurrent",
    "takenFromIncoming",
    "addedByCurrent",
    "addedByIncoming",
    "removedByCurrent",
    "removedByIncoming",
]);

const otherSide = (side: MergeSide): MergeSide => (side === "current" ? "incoming" : "current");

function replay(result: MergeResult, picks: readonly Pick[]): MergeDecisions {
    const decisions = MergeDecisions.from(result);
    for (const { id, side, withContents } of picks) {
        const outcome = withContents
            ? decisions.pickWithContents(id, side)
            : decisions.pick(id, side);
        expect(outcome.applied, `replaying ${id} → ${side}`).toBe(true);
    }
    return decisions;
}

function stateOf(decisions: MergeDecisions, result: MergeResult) {
    return {
        sides: result.elements.map(({ id }) => decisions.sideOf(id)),
        open: decisions.openConflicts.map(({ id, state }) => `${id}:${state}`),
    };
}

/** Depth first over the first open conflict, both sides; a blocked pick must change nothing and ends its branch. */
function explore(result: MergeResult, picks: readonly Pick[], exploration: Exploration): void {
    expect(picks.length, "picks on one branch").toBeLessThanOrEqual(MAX_PICKS);
    const decisions = replay(result, picks);
    const [first] = decisions.openConflicts;
    if (first === undefined) {
        const resolution = decisions.resolution();
        exploration.endStates.set(JSON.stringify(resolution), { resolution, picks });
        return;
    }
    let applied = 0;
    for (const side of SIDES) {
        const branch = replay(result, picks);
        const before = stateOf(branch, result);
        const outcome = branch.pick(first.id, side);
        if (!outcome.applied) {
            expect(stateOf(branch, result)).toEqual(before);
            exploration.blockedPicks++;
            continue;
        }
        applied++;
        expect(branch.openConflicts.map(({ id }) => id)).not.toContain(first.id);
        explore(result, [...picks, { id: first.id, side }], exploration);
    }
    if (applied === 0) exploration.deadEnds.push(first.id);
}

async function expectSoundBuild(
    sources: MergeSources,
    result: MergeResult,
    { resolution, picks }: EndState,
) {
    const decisions = replay(result, picks);
    expect(decisions.resolution()).toEqual(resolution);
    const { xml } = await buildMerged(sources, decisions);
    const parsed = await parseWithoutWarnings(xml);
    const drawingCounts = new Map<string, number>();
    for (const diagram of parsed.rootElement.diagrams as {
        plane: { planeElement?: { bpmnElement?: { id: string } }[] };
    }[]) {
        for (const drawing of diagram.plane.planeElement ?? []) {
            const id = drawing.bpmnElement!.id;
            drawingCounts.set(id, (drawingCounts.get(id) ?? 0) + 1);
        }
    }
    const typeOf = new Map(result.elements.map(({ id, type }) => [id, type]));
    const drawnByShape = Object.keys(resolution.layout).filter(
        (id) => !PLANE_OWNER_TYPES.has(typeOf.get(id)!),
    );
    expect(Object.fromEntries(drawnByShape.map((id) => [id, drawingCounts.get(id)]))).toEqual(
        Object.fromEntries(drawnByShape.map((id) => [id, 1])),
    );
    expect([...drawingCounts.values()].every((count) => count === 1)).toBe(true);
}

async function exploreScenario(versions: MergeVersions, startPicks: readonly Pick[] = []) {
    const [result, sources] = await Promise.all([
        computeMerge(versions),
        prepareMergeSources(versions),
    ]);
    const exploration: Exploration = { endStates: new Map(), blockedPicks: 0, deadEnds: [] };
    explore(result, startPicks, exploration);
    for (const endState of exploration.endStates.values()) {
        await expectSoundBuild(sources, result, endState);
    }
    return { result, sources, exploration };
}

/** The resolution of the elements whose versions differ: two end states alike there build the same file. */
function distinctionOf(result: MergeResult, resolution: MergeResolution): string {
    const differing = result.elements.filter(
        ({ state }) =>
            !["unchanged", "sameChange", "sameAddition", "removedByBoth"].includes(state),
    );
    return JSON.stringify(differing.map(({ id }) => resolution.elements[id]));
}

/**
 * From each end state, overrides one automatic resolution whose versions
 * differ, closes the conflicts that opens with both sides, and builds every
 * end state not reached before.
 */
async function exploreOverrides(sources: MergeSources, result: MergeResult, reached: Exploration) {
    const distinct = new Set(
        [...reached.endStates.values()].map(({ resolution }) => distinctionOf(result, resolution)),
    );
    const overrides: Exploration = { endStates: new Map(), blockedPicks: 0, deadEnds: [] };
    const overridable = result.elements.filter(({ state }) => OVERRIDABLE_STATES.has(state));
    for (const { resolution, picks } of reached.endStates.values()) {
        for (const { id } of overridable) {
            const override = { id, side: otherSide(resolution.elements[id]!) };
            const branch = replay(result, picks);
            const before = stateOf(branch, result);
            if (!branch.pick(override.id, override.side).applied) {
                expect(stateOf(branch, result)).toEqual(before);
                overrides.blockedPicks++;
                continue;
            }
            explore(result, [...picks, override], overrides);
        }
    }
    const added = new Map<string, EndState>();
    for (const endState of overrides.endStates.values()) {
        const distinction = distinctionOf(result, endState.resolution);
        if (!distinct.has(distinction)) added.set(distinction, endState);
        distinct.add(distinction);
    }
    for (const endState of added.values()) {
        await expectSoundBuild(sources, result, endState);
    }
    return { overrides, distinctEndStates: distinct.size };
}

/** Distinct end states per scenario with more than one, so a cap or a pruned branch shows; every other scenario has one. */
const EXPECTED_END_STATES: Readonly<Record<string, number>> = {
    "table: both changed": 2,
    "type: current replaces a task with a collapsed sub-process incoming renames": 2,
    "type: incoming replaces a task with a collapsed sub-process current renames": 2,
    "table: both added": 2,
    "table: removed and changed": 2,
    "table: changed and removed": 2,
    "table: every row (c7)": 16,
    "table: every row (c8)": 16,
    "no base: sides differ": 2,
    "no base: only one side": 4,
    "dangling: current removes a task, incoming adds a flow from it": 2,
    "dangling: boundary event kept, host dropped": 2,
    "data association onto a task incoming renames": 2,
    "gateway removed with its default flow": 2,
    "no base: incoming wraps the process in a pool": 3,
    "lanes only incoming adds": 2,
    ...Object.fromEntries(
        MERGE_SCENARIOS.filter(({ name }) => name.startsWith("rule: ")).map(({ name }) => [
            name,
            2,
        ]),
    ),
    [ALL_CONFLICTS_SCENARIO]: 128,
};
/**
 * Distinct end states, alike on the elements whose versions agree, with an
 * override of one automatic resolution; every other scenario reaches one.
 */
const EXPECTED_DISTINCT_END_STATES: Readonly<Record<string, number>> = {
    "table: taken from current": 2,
    "table: taken from incoming": 2,
    "table: both changed": 2,
    "table: added by current": 2,
    "table: added by incoming": 2,
    "table: both added": 2,
    "table: removed by current": 3,
    "table: removed by incoming": 3,
    "table: removed and changed": 3,
    "table: changed and removed": 3,
    "unknown namespaced attribute changed": 2,
    "moved into another lane": 2,
    "moved into a sub-process": 2,
    "no base: sides differ": 2,
    "no base: only one side": 4,
    "dangling: current removes a task, incoming adds a flow from it": 9,
    "dangling: boundary event kept, host dropped": 14,
    "rule: parent": 10,
    "rule: default flow": 3,
    "rule: message reference": 4,
    "rule: error reference": 4,
    "rule: signal reference": 3,
    "rule: escalation reference": 3,
    "rule: data object reference": 5,
    "rule: data store reference": 3,
    "rule: data association": 5,
    "rule: association end": 4,
    "rule: compensation association end": 5,
    "rule: compensation activity reference": 3,
    "rule: message flow end": 3,
    "rule: process reference": 3,
    "rule: lane": 6,
    "independent changes (c7)": 4,
    "independent changes (c8)": 4,
    "namespace only incoming declares": 2,
    "prefix collision": 3,
    "root element only incoming adds": 4,
    "data association onto a task incoming renames": 3,
    "gateway removed with its default flow": 4,
    "lanes only incoming adds": 16,
    "no base: incoming wraps the process in a pool": 3,
    "collapse: current adds a task inside a sub-process incoming collapses": 2,
    "boundary event its host lists, removed by incoming": 3,
    "type: current replaces a task with a collapsed sub-process incoming renames": 2,
    "type: incoming replaces a task with a collapsed sub-process current renames": 2,
    "interface and operation reference only incoming adds": 3,
    [PLATFORM_ONLY_SCENARIO]: 2,
    [ALL_CONFLICTS_SCENARIO]: 192,
};
/** Each row has a scenario of its own; overriding all rows' combinations takes two seconds. */
const OVERRIDES_COVERED_ELSEWHERE: ReadonlySet<string> = new Set([
    "table: every row (c7)",
    "table: every row (c8)",
]);
/** Sub_Ship and Task_Pack are decided by the container pick; five conflicts remain open. */
const CONFLICTS_OUTSIDE_SUB_SHIP_END_STATES = 32;

/** 192 builds: about 3 s under coverage locally and 6 s on a CI runner, past Vitest's 5 s default. */
const ALL_CONFLICTS_TIMEOUT_MS = 20_000;

async function expectEveryEndStateBuildsSoundly(
    scenario: MergeVersions & { readonly name: string },
) {
    const { result, sources, exploration } = await exploreScenario(scenario);

    expect(exploration.deadEnds).toEqual([]);
    expect(exploration.endStates.size).toBe(EXPECTED_END_STATES[scenario.name] ?? 1);
    expect(exploration.endStates.size).toBeLessThanOrEqual(
        2 ** MergeDecisions.from(result).openConflicts.length,
    );
    if (OVERRIDES_COVERED_ELSEWHERE.has(scenario.name)) return;
    const { overrides, distinctEndStates } = await exploreOverrides(sources, result, exploration);
    expect(overrides.deadEnds).toEqual([]);
    expect(distinctEndStates).toBe(EXPECTED_DISTINCT_END_STATES[scenario.name] ?? 1);
}

describe("every end state the picks reach, overriding one automatic resolution each", () => {
    it.each(
        MERGE_SCENARIOS.filter(({ name }) => name !== ALL_CONFLICTS_SCENARIO).map((scenario) => ({
            ...scenario,
        })),
    )("$name: every end state builds a sound file", expectEveryEndStateBuildsSoundly);

    it(
        `${ALL_CONFLICTS_SCENARIO}: every end state builds a sound file`,
        () => expectEveryEndStateBuildsSoundly(scenarioNamed(ALL_CONFLICTS_SCENARIO)),
        ALL_CONFLICTS_TIMEOUT_MS,
    );

    it.each(SIDES)(
        "all conflicts: taking Sub_Ship with its contents from %s builds every end state",
        async (side) => {
            const scenario = scenarioNamed(ALL_CONFLICTS_SCENARIO);
            const { exploration } = await exploreScenario(scenario, [
                { id: "Sub_Ship", side, withContents: true },
            ]);

            expect(exploration.deadEnds).toEqual([]);
            expect(exploration.endStates.size).toBe(CONFLICTS_OUTSIDE_SUB_SHIP_END_STATES);
            for (const { resolution } of exploration.endStates.values()) {
                expect(resolution.elements.Task_Pack).toBe(side);
            }
        },
    );
});

describe("a hand merge of each picked element's own text", () => {
    it.each(
        MERGE_SCENARIOS.filter(({ base }) => base !== undefined).map((scenario) => ({
            ...scenario,
        })),
    )("$name: equal text builds byte-equal", async (scenario) => {
        const [result, sources] = await Promise.all([
            computeMerge(scenario),
            prepareMergeSources(scenario),
        ]);
        for (const side of SIDES) {
            const decisions = MergeDecisions.from(result);
            const picked = [...sources.handMergeTexts.keys()].filter(
                (id) => decisions.pick(id, side).applied,
            );
            for (let [open] = decisions.openConflicts; open; [open] = decisions.openConflicts) {
                expect(SIDES.some((choice) => decisions.pick(open!.id, choice).applied)).toBe(true);
            }
            const plain = await buildMerged(sources, decisions);

            for (const id of picked.filter((candidate) => decisions.sideOf(candidate) === side)) {
                const own = sources.handMergeTexts.get(id)![side];
                expect(await acceptHandMerge(sources, decisions, id, side, own), id).toEqual({
                    applied: true,
                });
            }

            expect(decisions.handMergedVersions).toEqual([]);
            expect((await buildMerged(sources, decisions)).xml).toBe(plain.xml);
        }
    });
});
