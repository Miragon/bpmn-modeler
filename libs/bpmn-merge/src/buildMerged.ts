import type { ElementSnapshot, ModdleElement } from "@miragon/bpmn-modeler-diff";

import { checkMergedXml } from "./buildChecks";
import { type MergeSources, requireSourcesOf } from "./buildMergedSources";
import {
    type BuildNote,
    addedAtSamePlaceNotes,
    drawnApartFromContainerNotes,
    flowEndsNotes,
    layoutChangedByBothNotes,
    restoredWithoutConnectionsNotes,
} from "./buildNotes";
import { isEnclosingContainer } from "./containerContents";
import { boundsIn, diagramIndexOf } from "./diagramIndex";
import { assembleDiagrams, drawingSidesOf, drawnByShape } from "./diagramMerge";
import type { MergeModdle } from "./engineModdle";
import type { MergeDecisions } from "./mergeDecisions";
import type { MergeSide } from "./mergeResult";
import { assembleSemanticTree, versionTreeOf } from "./mergedTree";
import { rebuildDerivedReferences } from "./mergedTreeDerived";
import { applyFrame, mergeFrames } from "./mergedTreeFrame";
import { laneMembersOf } from "./mergedTreeLanes";

export type { BuildNote } from "./buildNotes";

export interface MergedDocument {
    readonly xml: string;
    readonly notes: readonly BuildNote[];
}

/**
 * Writes the merged BPMN of the sources' versions: current's file as the
 * frame with the definitions attributes only incoming changed, each element
 * and its drawing as its side wrote them, derived references rebuilt,
 * serialised as the modeler saves. Throws on open conflicts and refuses a
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
    const [current, incoming] = await Promise.all([
        parsedVersion(mergeModdle, versions.current),
        parsedVersion(mergeModdle, versions.incoming),
    ]);
    const diagramIndexes = { current: diagramIndexOf(current), incoming: diagramIndexOf(incoming) };
    const frame = mergeFrames(sources.frames);
    const trees = { current: versionTreeOf(current), incoming: versionTreeOf(incoming) };

    applyFrame(current, frame.takenFromIncoming);
    const resultUnits = assembleSemanticTree(trees, resolution.elements);
    const laneMembers = laneMembersOf(result, resolution);
    rebuildDerivedReferences(current, laneMembers);
    const drawingSides = drawingSidesOf(result, resolution, diagramIndexes);
    assembleDiagrams(current, diagramIndexes, resolution, drawingSides, resultUnits);
    const { xml } = await mergeModdle.moddle.toXML(current, { format: true });

    await checkMergedXml(
        xml,
        {
            sourceSnapshots: sourceSnapshotsOf(sources, resolution.elements),
            drawnByShape: drawnByShape(diagramIndexes, drawingSides.sides),
            laneMembers,
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
            ...layoutChangedByBothNotes(
                result,
                resolution,
                (id, side) => sources.snapshots[side].get(id)?.layout,
            ),
            ...frame.notes,
        ],
    };
}

async function parsedVersion(mergeModdle: MergeModdle, xml: string): Promise<ModdleElement> {
    return (await mergeModdle.moddle.fromXML(xml)).rootElement;
}

function sourceSnapshotsOf(
    { snapshots }: MergeSources,
    sides: Readonly<Record<string, MergeSide>>,
): Map<string, ElementSnapshot> {
    const sourceSnapshots = new Map<string, ElementSnapshot>();
    for (const [id, side] of Object.entries(sides)) {
        const snapshot = snapshots[side].get(id);
        if (snapshot) sourceSnapshots.set(id, snapshot);
    }
    return sourceSnapshots;
}
