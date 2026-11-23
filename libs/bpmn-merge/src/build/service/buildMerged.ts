import type { ElementSnapshot, ModdleElement, ModdleParseResult } from "@miragon/bpmn-modeler-diff";

import { checkMergedXml } from "./buildChecks";
import { requireSourcesOf } from "../../sources/service/buildMergedSources";
import { type BuildNote, buildNotesOf } from "../domain/buildNotes";
import { assembleDiagrams } from "../domain/diagramMerge";
import { drawingSidesOf, drawnByShape } from "../domain/drawingSides";
import type { MergeModdle, MergeSources } from "../../sources/domain/mergeSources";
import type { HandMergedVersion } from "../../decide/domain/handMerge";
import { spliceHandMergedText } from "../../sources/domain/handMergeSplice";
import { isMergeUnit, parseElementText } from "../../sources/service/handMergeText";
import {
    BUILD_LAYOUT_REPAIRS,
    type LayoutRepairPlanners,
    repairIntroducedSpots,
} from "../domain/layout/layoutDrawingRepair";
import type { MergeDecisions } from "../../decide/domain/mergeDecisions";
import { type MergeSide, otherSide } from "../../kernel/domain/mergeResult";
import { assembleSemanticTree } from "../domain/mergedTree";
import { restoreDefaultFlows } from "../domain/mergedTreeDefaults";
import { rebuildDerivedReferences } from "../domain/mergedTreeDerived";
import { applyFrame, mergeFrames } from "../domain/mergedTreeFrame";
import { laneMembersOf } from "../domain/mergedTreeLanes";
import { restoredFlowDefaultsOf } from "../../decide/domain/removedWith";
import { SideReadings } from "../domain/sideReadings";
import { sideTextOf } from "../../sources/domain/sideText";

export type { BuildNote } from "../domain/buildNotes";

export interface MergedDocument {
    readonly xml: string;
    readonly notes: readonly BuildNote[];
}

/**
 * Writes the merged BPMN of the sources' versions: current's file as the
 * frame with the definitions attributes only incoming changed, each element
 * and its drawing as its side wrote them, derived references rebuilt, a
 * flow kept against its removal its source's default again
 * (`restoredFlowDefaultsOf`), serialised as the modeler saves. Throws on open conflicts and refuses a
 * result that fails its checks, naming the ids. Notes every broken spot of the drawing that
 * neither side drew itself, moves the shapes the build placed on another, and re-routes the
 * flows that end off their shapes or run through one; a flow no diagram draws both ends of
 * stays out of the drawing with a note.
 */
export function buildMerged(
    sources: MergeSources,
    decisions: MergeDecisions,
): Promise<MergedDocument> {
    return buildMergedWith(sources, decisions, BUILD_LAYOUT_REPAIRS);
}

/** `buildMerged` with the layout repairs it applies, for the specs that compare a build with fewer. */
export async function buildMergedWith(
    sources: MergeSources,
    decisions: MergeDecisions,
    planners: LayoutRepairPlanners,
): Promise<MergedDocument> {
    const result = decisions.result;
    requireSourcesOf(result, sources);
    const resolution = decisions.resolution();
    const { mergeModdle, versions } = sources;
    const parsed = {
        current: await mergeModdle.moddle.fromXML(versions.current),
        incoming: await mergeModdle.moddle.fromXML(versions.incoming),
    };
    await spliceHandMerges(mergeModdle, decisions.handMergedVersions, parsed);
    const sides = SideReadings.of(parsed);
    const current = sides.currentDefinitions;
    const frame = mergeFrames(sources.frames);

    applyFrame(current, frame.takenFromIncoming);
    const resultUnits = assembleSemanticTree(sides.trees, resolution.elements);
    const flowDefaults = restoredFlowDefaultsOf(result.elements, (id) => resolution.elements[id]);
    const restoredDefaults = restoreDefaultFlows(resultUnits, flowDefaults);
    const laneMembers = laneMembersOf(result, resolution);
    rebuildDerivedReferences(current, laneMembers);
    const drawingSides = drawingSidesOf(result, resolution, sides.indexes);
    const undrawnEdges = assembleDiagrams(
        current,
        sides.indexes,
        sides.slots,
        drawingSides,
        resultUnits,
    );
    const layoutSpotNotes = repairIntroducedSpots(
        current,
        sides.layoutsCurrentFirst,
        sides.slots,
        planners,
        resolution.appendedLanes,
        (point) => mergeModdle.moddle.create("dc:Point", { x: point.x, y: point.y }),
        resolution.layoutLeader === undefined ? undefined : sides.layouts[resolution.layoutLeader],
    );
    const { xml } = await mergeModdle.moddle.toXML(current, { format: true });

    await checkMergedXml(
        xml,
        {
            sourceSnapshots: sourceSnapshotsOf(sources, resolution.elements, decisions),
            drawnByShape: drawnByShape(sides.indexes, drawingSides.sides, undrawnEdges),
            laneMembers,
            restoredDefaults,
        },
        mergeModdle,
    );
    return {
        xml,
        notes: buildNotesOf({
            result,
            resolution,
            undrawnEdges,
            layoutSpotNotes,
            flowDefaults,
            restoredDefaults,
            layoutOf: (id, side) => sources.snapshots[side].get(id)?.layout,
            frameNotes: frame.notes,
        }),
    };
}

/**
 * Splices each hand-merged version into its side's element before the trees
 * are taken apart, so it moves like the rest of the side. A reference names
 * what the hand merges bring in on its side first, then the side's elements,
 * then the same on the other side, so one hand merge may name a part another
 * adds. An accepted version always splices, so a failure is a bug.
 */
async function spliceHandMerges(
    mergeModdle: MergeModdle,
    handMerges: readonly HandMergedVersion[],
    parsed: Readonly<Record<MergeSide, ModdleParseResult>>,
): Promise<void> {
    const texts = await Promise.all(
        handMerges.map(async (handMerge) => {
            const unit = parsed[handMerge.side].elementsById[handMerge.id];
            if (unit === undefined) {
                throw new Error(
                    `The ${handMerge.side} version has no ${handMerge.id} to merge by hand`,
                );
            }
            const text = await parseElementText(mergeModdle, handMerge.content, unit.$type);
            return { handMerge, unit, text };
        }),
    );
    const broughtIn: Record<MergeSide, Map<string, ModdleElement>> = {
        current: new Map(),
        incoming: new Map(),
    };
    for (const { handMerge, text } of texts) {
        for (const [id, element] of Object.entries(text.elementsById)) {
            if (element !== undefined && element !== text.element) {
                broughtIn[handMerge.side].set(id, element);
            }
        }
    }
    const elementOn = (side: MergeSide, id: string) =>
        broughtIn[side].get(id) ?? parsed[side].elementsById[id];
    for (const { handMerge, unit, text } of texts) {
        const { id, side, scope } = handMerge;
        spliceHandMergedText(unit, text, scope, isMergeUnit, (target) => {
            const found = elementOn(side, target) ?? elementOn(otherSide(side), target);
            if (found === undefined) {
                throw new Error(`The hand-merged ${id} names ${target}, which neither side has`);
            }
            return found;
        });
    }
}

function sourceSnapshotsOf(
    { snapshots }: MergeSources,
    sides: Readonly<Record<string, MergeSide>>,
    decisions: MergeDecisions,
): Map<string, ElementSnapshot> {
    const sourceSnapshots = new Map<string, ElementSnapshot>();
    for (const [id, side] of Object.entries(sides)) {
        const snapshot = snapshots[side].get(id);
        const text = sideTextOf(snapshots, decisions.handMergeOf(id), id, side);
        if (snapshot === undefined || text === undefined) continue;
        sourceSnapshots.set(id, {
            ...snapshot,
            content: text.content,
            attributes: text.attributes,
        });
    }
    return sourceSnapshots;
}
