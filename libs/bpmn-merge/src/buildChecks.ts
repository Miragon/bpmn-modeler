import {
    type ElementSnapshot,
    type ModdleElement,
    type ModdleParseResult,
    elementSnapshots,
    isModdleElement,
} from "@miragon/bpmn-modeler-diff";

import type { MergeModdle } from "./engineModdle";
import { isMergeElement } from "./mergeElements";
import {
    enclosingSubProcessOf,
    flowsBySourceOf,
    flowsByTargetOf,
    idOf,
    idsOf,
    isAttachedBoundaryEvent,
    semanticElementsOf,
} from "./mergedTreeDerived";

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
    requireOneDrawingPerDrawnElement(parsed.rootElement, expectations.drawnByShape);
    requireDrawingsOnTheirContainersPlane(parsed.rootElement);
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
    definitions: ModdleElement,
    drawnByShape: ReadonlySet<string>,
): void {
    const drawingCounts = new Map<string, number>();
    for (const diagram of moddleElements(definitions.diagrams)) {
        for (const drawing of moddleElements(
            (diagram.plane as ModdleElement | undefined)?.planeElement,
        )) {
            const id = idOf(drawing.bpmnElement);
            if (id !== undefined) drawingCounts.set(id, (drawingCounts.get(id) ?? 0) + 1);
        }
    }
    const drawnTwice = [...drawingCounts].filter(([, count]) => count > 1).map(([id]) => id);
    if (drawnTwice.length > 0) refuse("elements have more than one shape or edge", drawnTwice);
    const undrawn = [...drawnByShape].filter((id) => !drawingCounts.has(id));
    if (undrawn.length > 0) refuse("drawn elements have no shape or edge", undrawn);
}

/**
 * A sub-process's contents lie on its own plane when it is collapsed and has
 * one, otherwise on the plane its shape lies on, as bpmn-js reads them.
 */
export function requireDrawingsOnTheirContainersPlane(definitions: ModdleElement): void {
    const planeOwnerByElement = new Map<string, string>();
    const drawingByElement = new Map<string, ModdleElement>();
    const planeOwners = new Set<string>();
    for (const diagram of moddleElements(definitions.diagrams)) {
        const plane = diagram.plane as ModdleElement | undefined;
        const planeOwner = idOf(plane?.bpmnElement) ?? "";
        planeOwners.add(planeOwner);
        for (const drawing of moddleElements(plane?.planeElement)) {
            const id = idOf(drawing.bpmnElement);
            if (id === undefined) continue;
            planeOwnerByElement.set(id, planeOwner);
            drawingByElement.set(id, drawing);
        }
    }
    const contentsPlaneOf = (subProcess: string) =>
        planeOwners.has(subProcess) && drawingByElement.get(subProcess)?.isExpanded !== true
            ? subProcess
            : planeOwnerByElement.get(subProcess);
    const misplaced = [...drawingByElement]
        .filter(([id, drawing]) => {
            const subProcess = enclosingSubProcessOf(drawing.bpmnElement as ModdleElement);
            const expected = subProcess === undefined ? undefined : contentsPlaneOf(subProcess);
            return expected !== undefined && expected !== planeOwnerByElement.get(id);
        })
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
                    !sameIds(idsOf(node.incoming), flowIdsByTarget.get(node.id ?? "") ?? []) ||
                    !sameIds(idsOf(node.outgoing), flowIdsBySource.get(node.id ?? "") ?? []),
            )
            .map((node) => node.id),
        ...lanes
            .filter(
                (lane) =>
                    !sameIds(idsOf(lane.flowNodeRef), [...(laneMembers.get(lane.id ?? "") ?? [])]),
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
                !sameIds(merged.lanes, source.lanes)
            );
        })
        .map(([id]) => id);
    const unexpected = [...resultSnapshots.keys()].filter((id) => !sourceSnapshots.has(id));
    if (differing.length + unexpected.length > 0) {
        refuse("elements differ from the side they are taken from", [...differing, ...unexpected]);
    }
}

function sameIds(
    actual: readonly (string | undefined)[],
    expected: readonly (string | undefined)[],
): boolean {
    const expectedIds = new Set(expected);
    return actual.length === expected.length && actual.every((id) => expectedIds.has(id));
}

function refuse(reason: string, details: readonly (string | undefined)[]): never {
    throw new Error(`The merged BPMN is refused, ${reason}: ${details.join(", ")}`);
}

function moddleElements(value: unknown): ModdleElement[] {
    return Array.isArray(value) ? value.filter(isModdleElement) : [];
}
