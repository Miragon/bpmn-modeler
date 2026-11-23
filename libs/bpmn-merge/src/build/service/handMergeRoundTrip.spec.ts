import { describe, expect, it } from "vitest";

import { MERGE_SCENARIOS } from "../../__fixtures__/mergeScenarios";
import { handMergedVersionOf } from "./acceptHandMerge";
import { buildMerged } from "./buildMerged";
import type { MergeSources } from "../../sources/domain/mergeSources";
import { prepareMergeSources } from "../../sources/service/buildMergedSources";
import { computeMerge } from "../../classify/service/computeMerge";
import { handMergeScopeOf } from "../../decide/domain/handMerge";
import { keepsInText } from "../../sources/domain/handMergeSplice";
import { cutElementText } from "../../sources/service/handMergeText";
import { MergeDecisions } from "../../decide/domain/mergeDecisions";
import { MERGE_SIDES, type MergeElement, type MergeSide } from "../../kernel/domain/mergeResult";

const ROUND_TRIP_TIMEOUT_MS = 30_000;

/** Picks each open conflict's first side that applies; false when one has none. */
function settleOpenConflicts(decisions: MergeDecisions): boolean {
    for (
        let [open] = decisions.openConflicts;
        open !== undefined;
        [open] = decisions.openConflicts
    ) {
        const settled = MERGE_SIDES.some((side) => decisions.pick(open!.id, side).applied);
        if (!settled) return false;
    }
    return true;
}

/** The side's text as a hand merge shows it. */
async function sideTextOf(
    sources: MergeSources,
    element: MergeElement,
    side: MergeSide,
): Promise<string> {
    const { content, type } = sources.snapshots[side].get(element.id)!;
    const scope = handMergeScopeOf(type);
    if (scope === "ownContent") return content;
    return cutElementText(sources.snapshotModdle, content, type, keepsInText(scope));
}

const threeVersionElements = (elements: readonly MergeElement[]) =>
    elements.filter(({ versions }) => versions.base && versions.current && versions.incoming);

describe("a hand merge of the picked side's own text", () => {
    it.each(
        MERGE_SCENARIOS.filter(({ base }) => base !== undefined).map((scenario) => ({
            ...scenario,
        })),
    )(
        "$name: gives each side's version and builds the plain picks' file byte for byte",
        async (scenario) => {
            const [result, sources] = await Promise.all([
                computeMerge(scenario),
                prepareMergeSources(scenario),
            ]);
            for (const side of MERGE_SIDES) {
                const decisions = MergeDecisions.from(result);
                const picked = threeVersionElements(result.elements).filter(
                    ({ id }) => decisions.pick(id, side).applied,
                );
                expect(settleOpenConflicts(decisions)).toBe(true);
                const plain = await buildMerged(sources, decisions);

                for (const element of picked.filter(({ id }) => decisions.sideOf(id) === side)) {
                    const analysis = await handMergedVersionOf(
                        sources,
                        decisions.result,
                        element.id,
                        side,
                        await sideTextOf(sources, element, side),
                    );

                    expect(analysis, `${element.id} from ${side}`).toEqual({
                        merged: expect.objectContaining({
                            version: element.versions[side],
                            content: sources.snapshots[side].get(element.id)!.content,
                        }),
                    });
                    if (!("merged" in analysis)) continue;
                    expect(decisions.mergeByHand(analysis.merged)).toEqual({ applied: true });
                }
                const handMerged = await buildMerged(sources, decisions);

                expect(decisions.handMergedVersions.length).toBeGreaterThan(0);
                expect(handMerged.xml, `every element from ${side}`).toBe(plain.xml);
            }
        },
        ROUND_TRIP_TIMEOUT_MS,
    );
});
