import type { ElementSnapshot, ModdleElement } from "@miragon/bpmn-modeler-diff";

import { checkMergedXml } from "./buildChecks";
import type { MergeSources } from "./buildMergedSources";
import {
    type BuildNote,
    addedAtSamePlaceNotes,
    drawnApartFromContainerNotes,
    flowEndsNotes,
} from "./buildNotes";
import { isEnclosingContainer } from "./containerContents";
import { boundsIn, diagramIndexOf } from "./diagramIndex";
import { assembleDiagrams, drawnByShape } from "./diagramMerge";
import type { MergeModdle } from "./engineModdle";
import type { MergeDecisions } from "./mergeDecisions";
import type { MergeSide } from "./mergeResult";
import { assembleSemanticTree, requireDecidedElements, versionTreeOf } from "./mergedTree";
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
    const resolution = decisions.resolution();
    const result = decisions.result;
    const { mergeModdle, versions } = sources;
    const [current, incoming] = await Promise.all([
        parsedVersion(mergeModdle, versions.current),
        parsedVersion(mergeModdle, versions.incoming),
    ]);
    const diagramIndexes = { current: diagramIndexOf(current), incoming: diagramIndexOf(incoming) };
    const frame = mergeFrames(sources.frames);
    const trees = { current: versionTreeOf(current), incoming: versionTreeOf(incoming) };
    requireDecidedElements(result, trees);

    applyFrame(current, frame.takenFromIncoming);
    const resultUnits = assembleSemanticTree(trees, resolution.elements);
    const laneMembers = laneMembersOf(result, resolution);
    rebuildDerivedReferences(current, laneMembers);
    assembleDiagrams(current, diagramIndexes, resolution, resultUnits);
    const { xml } = await mergeModdle.moddle.toXML(current, { format: true });

    await checkMergedXml(
        xml,
        {
            sourceSnapshots: sourceSnapshotsOf(sources, resolution.elements),
            drawnByShape: drawnByShape(diagramIndexes, resolution.layout),
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
