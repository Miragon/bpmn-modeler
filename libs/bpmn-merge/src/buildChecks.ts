import {
    type ElementSnapshot,
    type ModdleElement,
    type ModdleParseResult,
    elementSnapshots,
    idsOf,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

import { enclosingSubProcessOf } from "./containerContents";
import { type DiagramIndex, contentsPlaneIn, diagramIndexOf } from "./diagramIndex";
import type { MergeModdle } from "./engineModdle";
import { isMergeElement } from "./mergeElements";
import {
    flowsBySourceOf,
    flowsByTargetOf,
    isAttachedBoundaryEvent,
    semanticElementsOf,
} from "./mergedTreeDerived";
import { sameLanes } from "./mergeResult";

/** What the merged file must hold, known before it is written. */
export interface BuildExpectations {
    /** Every element of the result with the snapshot of the side it is taken from. */
    readonly sourceSnapshots: ReadonlyMap<string, ElementSnapshot>;
    /** Every element the result draws with a shape or an edge. */
    readonly drawnByShape: ReadonlySet<string>;
    /** Every lane of the result with the nodes it lists. */
    readonly laneMembers: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Refuses the merged file, rather than repairing it, unless a fresh parse of
 * it holds what was decided. The result declares no prefix the versions'
 * moddle lacks, so that moddle parses it.
 */
export async function checkMergedXml(
    xml: string,
    expectations: BuildExpectations,
    { moddle, prefixSources }: MergeModdle,
): Promise<void> {
    const parsed = await moddle.fromXML(xml);
    requireNoParserWarnings(parsed);
    const diagramIndex = diagramIndexOf(parsed.rootElement);
    requireOneDrawingPerDrawnElement(diagramIndex, expectations.drawnByShape);
    requireDrawingsOnTheirContainersPlane(diagramIndex);
    requireRebuiltDerivedReferences(parsed.rootElement, expectations.laneMembers);
    const resultSnapshots = await elementSnapshots(xml, { prefixSources, isUnit: isMergeElement });
    requireSourceContent(resultSnapshots, expectations.sourceSnapshots);
}

/** A parser warning is an unresolved reference, a duplicate id or skipped content, which the parse then leaves out. */
export function requireNoParserWarnings(parsed: ModdleParseResult): void {
    const warnings = (parsed.warnings ?? []).map((warning) => warning.message ?? String(warning));
    if (warnings.length > 0) refuse("it parses with warnings", warnings);
}

export function requireOneDrawingPerDrawnElement(
    diagramIndex: DiagramIndex,
    drawnByShape: ReadonlySet<string>,
): void {
    const drawnTwice = [...diagramIndex.drawingsByElement]
        .filter(([id, drawings]) => id !== "" && drawings.length > 1)
        .map(([id]) => id);
    if (drawnTwice.length > 0) refuse("elements have more than one shape or edge", drawnTwice);
    const undrawn = [...drawnByShape].filter((id) => !diagramIndex.drawingsByElement.has(id));
    if (undrawn.length > 0) refuse("drawn elements have no shape or edge", undrawn);
}

/** Every drawing lies where `contentsPlaneOf` puts the contents of its sub-process. */
export function requireDrawingsOnTheirContainersPlane(diagramIndex: DiagramIndex): void {
    const misplaced = [...diagramIndex.drawingsByElement]
        .filter(([id, drawings]) =>
            drawings.some(({ element, planeOwner }) => {
                const subProcess = enclosingSubProcessOf(element.bpmnElement as ModdleElement);
                const expected =
                    id === "" || subProcess === undefined
                        ? undefined
                        : contentsPlaneIn(diagramIndex, subProcess);
                return expected !== undefined && expected !== planeOwner;
            }),
        )
        .map(([id]) => id);
    if (misplaced.length > 0) {
        refuse("drawings lie on another plane than their sub-process implies", misplaced);
    }
}

export function requireRebuiltDerivedReferences(
    definitions: ModdleElement,
    laneMembers: ReadonlyMap<string, ReadonlySet<string>>,
): void {
    const { flowNodes, sequenceFlows, lanes, activities } = semanticElementsOf(definitions);
    const flowIdsOf = (flowsByEnd: Map<string, ModdleElement[]>) =>
        new Map([...flowsByEnd].map(([id, flows]) => [id, idsOf(flows)]));
    const flowIdsByTarget = flowIdsOf(flowsByTargetOf(sequenceFlows));
    const flowIdsBySource = flowIdsOf(flowsBySourceOf(sequenceFlows));
    const stale = [
        ...flowNodes
            .filter(
                (node) =>
                    !sameIdsInAnyOrder(
                        idsOf(node.incoming),
                        flowIdsByTarget.get(node.id ?? "") ?? [],
                    ) ||
                    !sameIdsInAnyOrder(
                        idsOf(node.outgoing),
                        flowIdsBySource.get(node.id ?? "") ?? [],
                    ),
            )
            .map((node) => node.id),
        ...lanes
            .filter(
                (lane) =>
                    !sameIdsInAnyOrder(idsOf(lane.flowNodeRef), [
                        ...(laneMembers.get(lane.id ?? "") ?? []),
                    ]),
            )
            .map((lane) => lane.id),
        ...activities
            .filter((activity) =>
                moddleElements(activity.boundaryEventRefs).some(
                    (boundaryEvent) => !isAttachedBoundaryEvent(boundaryEvent, activity),
                ),
            )
            .map((activity) => activity.id),
    ];
    if (stale.length > 0)
        refuse("derived references do not match the flows and lane decisions", [...new Set(stale)]);
}

/** Catches what a parse cannot see: a dropped unknown attribute, a namespace swap, an element in the wrong container. */
export function requireSourceContent(
    resultSnapshots: ReadonlyMap<string, ElementSnapshot>,
    sourceSnapshots: ReadonlyMap<string, ElementSnapshot>,
): void {
    const differing = [...sourceSnapshots]
        .filter(([id, source]) => {
            const merged = resultSnapshots.get(id);
            return (
                merged === undefined ||
                merged.content !== source.content ||
                merged.parent !== source.parent ||
                !sameLanes(merged.lanes, source.lanes)
            );
        })
        .map(([id]) => id);
    const unexpected = [...resultSnapshots.keys()].filter((id) => !sourceSnapshots.has(id));
    if (differing.length + unexpected.length > 0) {
        refuse("elements differ from the side they are taken from", [...differing, ...unexpected]);
    }
}

/** The derived lists keep the order an element had, so only which ids and how often counts. */
function sameIdsInAnyOrder(actual: readonly string[], expected: readonly string[]): boolean {
    const sorted = (ids: readonly string[]) =>
        JSON.stringify([...ids].sort((left, right) => left.localeCompare(right)));
    return sorted(actual) === sorted(expected);
}

function refuse(reason: string, details: readonly (string | undefined)[]): never {
    throw new Error(`The merged BPMN is refused, ${reason}: ${details.join(", ")}`);
}
