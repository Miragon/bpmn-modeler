import { describe, expect, it } from "vitest";

import { MERGE_SCENARIOS } from "./__fixtures__/mergeScenarios";
import {
    randomIndex,
    randomItem,
    randomMergeVersions,
    seededRandom,
} from "./__fixtures__/randomMergeVersions";
import { type MergeSources, prepareMergeSources } from "./buildMergedSources";
import { computeMerge } from "./computeMerge";
import { MergeDecisions } from "./mergeDecisions";
import { mergeNavigationOrder } from "./mergeNavigationOrder";
import { mergePaneSteps } from "./mergePaneSteps";
import { mergePaneView } from "./mergePaneView";
import { mergeRefusalOf } from "./mergeRefusal";
import { MERGE_SIDES } from "./mergeResult";
import type { MergeVersions } from "./mergeVersions";

const SEED_COUNT = 150;
const PICKS_PER_SEED = 6;
/** The random versions take a few seconds; CI runners are slower. */
const TIMEOUT_MS = 120_000;

/** What both panes show must leave the user no dead end and no mark the canvas cannot hold. */
function expectSoundProjections(
    decisions: MergeDecisions,
    sources: MergeSources,
    label: string,
): void {
    const { result } = decisions;
    const order = mergeNavigationOrder(result, sources);
    const views = MERGE_SIDES.map((side) => ({ side, view: mergePaneView(decisions, side) }));
    const steps = MERGE_SIDES.map((side) => mergePaneSteps(decisions, order, side));
    const elementsById = new Map(result.elements.map((element) => [element.id, element]));

    expect([...order].sort(), `${label}: the order holds every element once`).toEqual(
        result.elements.map(({ id }) => id).sort(),
    );

    const shownConflicts = new Set(
        views.flatMap(({ view }) => [
            ...view.marks.conflict,
            ...view.shapeless.filter(({ marker }) => marker === "conflict").map(({ id }) => id),
        ]),
    );
    const unshown = decisions.openConflicts.filter(({ id }) => !shownConflicts.has(id));
    expect(unshown, `${label}: every open conflict is on a pane`).toEqual([]);

    for (const { side, view } of views) {
        const marked = [...Object.values(view.marks).flat(), ...view.shapeless.map(({ id }) => id)];
        const notHeld = marked.filter((id) => elementsById.get(id)?.versions[side] === undefined);
        expect(notHeld, `${label}: ${side}'s pane marks only what its side holds`).toEqual([]);
    }

    const [currentSteps, incomingSteps] = steps;
    const nowhere = currentSteps.all.filter(
        (step, index) => !step.onThisPane && !incomingSteps.all[index].onThisPane,
    );
    expect(nowhere, `${label}: every step is on a pane`).toEqual([]);
    for (const paneSteps of steps) {
        expect(paneSteps.openConflicts, `${label}: one step per open conflict`).toHaveLength(
            decisions.openConflicts.length,
        );
    }

    const inAFlow = new Set([...sources.flowOrders.current, ...sources.flowOrders.incoming]);
    const firstOutsideFlows = order.findIndex((id) => !inAFlow.has(id));
    const lastInAFlow = Math.max(...order.map((id, index) => (inAFlow.has(id) ? index : -1)));
    if (firstOutsideFlows >= 0) {
        expect(
            lastInAFlow,
            `${label}: every element a flow reaches comes before the rest`,
        ).toBeLessThan(firstOutsideFlows);
    }
}

async function mergeOf(versions: MergeVersions) {
    try {
        return {
            decisions: MergeDecisions.from(await computeMerge(versions)),
            sources: await prepareMergeSources(versions),
        };
    } catch (error) {
        if (mergeRefusalOf(error) !== undefined) return undefined;
        throw error;
    }
}

function pickRandomly(decisions: MergeDecisions, seed: number): void {
    const random = seededRandom(seed);
    const conflict = randomItem(random, decisions.openConflicts);
    if (conflict === undefined) return;
    decisions.pick(conflict.id, MERGE_SIDES[randomIndex(random, MERGE_SIDES.length)]);
}

describe("the panes' projections", () => {
    it.each(MERGE_SCENARIOS.map((scenario) => [scenario.name, scenario] as const))(
        "stay sound for %s",
        async (name, scenario) => {
            const merge = await mergeOf(scenario);
            if (merge === undefined) return;
            expectSoundProjections(merge.decisions, merge.sources, name);
        },
    );

    it(
        `stay sound for seeds 1 to ${SEED_COUNT}, before and after random picks`,
        async () => {
            for (let seed = 1; seed <= SEED_COUNT; seed++) {
                const merge = await mergeOf(randomMergeVersions(seed));
                if (merge === undefined) continue;
                expectSoundProjections(merge.decisions, merge.sources, `seed ${seed}`);
                for (let pick = 1; pick <= PICKS_PER_SEED; pick++) {
                    pickRandomly(merge.decisions, seed * 100 + pick);
                    expectSoundProjections(
                        merge.decisions,
                        merge.sources,
                        `seed ${seed}, pick ${pick}`,
                    );
                }
            }
        },
        TIMEOUT_MS,
    );
});
