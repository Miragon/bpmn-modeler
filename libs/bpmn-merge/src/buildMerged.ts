import type { ElementSnapshot, ModdleParseResult } from "@miragon/bpmn-modeler-diff";

import { checkMergedXml } from "./buildChecks";
import { type MergeSources, requireSourcesOf } from "./buildMergedSources";
import {
    type BuildNote,
    addedAtSamePlaceNotes,
    defaultFlowNotRestoredNotes,
    drawnApartFromContainerNotes,
    flowEndsNotes,
    layoutChangedByBothNotes,
    restoredWithoutConnectionsNotes,
} from "./buildNotes";
import { isEnclosingContainer } from "./containerContents";
import { boundsIn, diagramIndexOf } from "./diagramIndex";
import { assembleDiagrams, drawingSidesOf, drawnByShape } from "./diagramMerge";
import type { MergeModdle } from "./engineModdle";
import type { HandMergedVersion } from "./handMerge";
import { spliceHandMergedText } from "./handMergeSplice";
import { isMergeUnit, parseElementText } from "./handMergeText";
import type { MergeDecisions } from "./mergeDecisions";
import { type MergeSide, otherSide } from "./mergeResult";
import { assembleSemanticTree, versionTreeOf } from "./mergedTree";
import { restoreDefaultFlows } from "./mergedTreeDefaults";
import { rebuildDerivedReferences } from "./mergedTreeDerived";
import { applyFrame, mergeFrames } from "./mergedTreeFrame";
import { laneMembersOf } from "./mergedTreeLanes";
import { restoredFlowDefaultsOf } from "./removedWith";

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
 * result that fails its checks, naming the ids.
 */
export async function buildMerged(
    sources: MergeSources,
    decisions: MergeDecisions,
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
            ...flowEndsNotes(result, resolution),
            ...addedAtSamePlaceNotes(result, resolution, (id, side) =>
                boundsIn(diagramIndexes[side], id),
            ),
            ...drawnApartFromContainerNotes(result, resolution, (id) =>
                isEnclosingContainer(resultUnits.get(id)),
            ),
            ...restoredWithoutConnectionsNotes(result, resolution),
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
 * are taken apart, so it moves like the rest of the side; its references name
 * the side's elements first, then the other side's. An accepted version always
 * splices, so a failure is a bug.
 */
async function spliceHandMerges(
    mergeModdle: MergeModdle,
    handMerges: readonly HandMergedVersion[],
    parsed: Readonly<Record<MergeSide, ModdleParseResult>>,
): Promise<void> {
    for (const { id, side, scope, content } of handMerges) {
        const unit = parsed[side].elementsById[id];
        if (unit === undefined) throw new Error(`The ${side} version has no ${id} to merge by hand`);
        const text = await parseElementText(mergeModdle, content, unit.$type);
        spliceHandMergedText(unit, text, scope, isMergeUnit, (target) => {
            const found =
                parsed[side].elementsById[target] ?? parsed[otherSide(side)].elementsById[target];
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
        const handMerge = decisions.handMergeOf(id);
        if (snapshot && handMerge?.side === side) {
            sourceSnapshots.set(id, {
                ...snapshot,
                content: handMerge.content,
                attributes: handMerge.attributes,
            });
        } else if (snapshot) {
            sourceSnapshots.set(id, snapshot);
        }
    }
    return sourceSnapshots;
}
