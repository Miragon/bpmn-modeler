import type { ElementSnapshot, ModdleElement, ModdleParseResult } from "@miragon/bpmn-modeler-diff";

import { checkMergedXml } from "./buildChecks";
import { type MergeSources, requireSourcesOf } from "./buildMergedSources";
import {
    type BuildNote,
    defaultFlowNotRestoredNotes,
    layoutChangedByBothNotes,
    restoredWithoutRemovedWithNotes,
} from "./buildNotes";
import { diagramIndexOf } from "./diagramIndex";
import { assembleDiagrams, drawingSidesOf, drawnByShape } from "./diagramMerge";
import type { MergeModdle } from "./engineModdle";
import type { HandMergedVersion } from "./handMerge";
import { spliceHandMergedText } from "./handMergeSplice";
import { isMergeUnit, parseElementText } from "./handMergeText";
import { type FlowRepairPlanner, repairIntroducedSpots } from "./layoutDrawingRepair";
import { planFlowRepairs } from "./layoutFlowRepair";
import { layoutModelOf } from "./layoutModelReader";
import type { MergeDecisions } from "./mergeDecisions";
import { type MergeSide, otherSide } from "./mergeResult";
import { assembleSemanticTree, versionTreeOf } from "./mergedTree";
import { restoreDefaultFlows } from "./mergedTreeDefaults";
import { rebuildDerivedReferences } from "./mergedTreeDerived";
import { applyFrame, mergeFrames } from "./mergedTreeFrame";
import { laneMembersOf } from "./mergedTreeLanes";
import { restoredFlowDefaultsOf } from "./removedWith";
import { sideTextOf } from "./sideText";

export type { BuildNote } from "./buildNotes";

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
 * neither side drew itself, and re-routes the flows among them that end off their shapes or
 * run through one.
 */
export function buildMerged(
    sources: MergeSources,
    decisions: MergeDecisions,
): Promise<MergedDocument> {
    return buildMergedWith(sources, decisions, planFlowRepairs);
}

/** `buildMerged` with the flow repair it applies, for the specs that compare a build without it. */
export async function buildMergedWith(
    sources: MergeSources,
    decisions: MergeDecisions,
    planRepairs: FlowRepairPlanner,
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
    const current = parsed.current.rootElement;
    const incoming = parsed.incoming.rootElement;
    const diagramIndexes = { current: diagramIndexOf(current), incoming: diagramIndexOf(incoming) };
    const sideLayouts = [layoutModelOf(current), layoutModelOf(incoming)];
    const frame = mergeFrames(sources.frames);
    const trees = { current: versionTreeOf(current), incoming: versionTreeOf(incoming) };

    applyFrame(current, frame.takenFromIncoming);
    const resultUnits = assembleSemanticTree(trees, resolution.elements);
    const flowDefaults = restoredFlowDefaultsOf(result.elements, (id) => resolution.elements[id]);
    const restoredDefaults = restoreDefaultFlows(resultUnits, flowDefaults);
    const laneMembers = laneMembersOf(result, resolution);
    rebuildDerivedReferences(current, laneMembers);
    const drawingSides = drawingSidesOf(result, resolution, diagramIndexes);
    assembleDiagrams(current, diagramIndexes, resolution, drawingSides, resultUnits);
    const layoutSpotNotes = repairIntroducedSpots(current, sideLayouts, planRepairs, (point) =>
        mergeModdle.moddle.create("dc:Point", { x: point.x, y: point.y }),
    );
    const { xml } = await mergeModdle.moddle.toXML(current, { format: true });

    await checkMergedXml(
        xml,
        {
            sourceSnapshots: sourceSnapshotsOf(sources, resolution.elements, decisions),
            drawnByShape: drawnByShape(diagramIndexes, drawingSides.sides),
            laneMembers,
            restoredDefaults,
        },
        mergeModdle,
    );
    return {
        xml,
        notes: [
            ...layoutSpotNotes,
            ...restoredWithoutRemovedWithNotes(result, resolution),
            ...defaultFlowNotRestoredNotes(flowDefaults, restoredDefaults),
            ...layoutChangedByBothNotes(
                result,
                resolution,
                (id, side) => sources.snapshots[side].get(id)?.layout,
            ),
            ...frame.notes,
        ],
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
