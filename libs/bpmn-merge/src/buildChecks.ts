import {
    type ElementSnapshot,
    type ModdleElement,
    type ModdleParseResult,
    elementSnapshots,
    idsOf,
    isModdleElement,
    isType,
    moddleElements,
    parseWarningMessages,
} from "@miragon/bpmn-modeler-diff";

import { rootsReachedFrom } from "./collaborationPools";
import { connectionEndsOf, edgePlaneOf } from "./connectionEnds";
import { enclosingSubProcessOf } from "./containerContents";
import { DiagramIndex } from "./diagramIndex";
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
    /** The flow each source names as its default again, on top of the version it is taken from. */
    readonly restoredDefaults: ReadonlyMap<string, string>;
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
    const diagramIndex = DiagramIndex.of(parsed.rootElement);
    requireOneDrawingPerDrawnElement(diagramIndex, expectations.drawnByShape);
    requireDrawingsOnTheirContainersPlane(diagramIndex);
    requireEdgesOnThePlaneOfTheirEnds(diagramIndex);
    requireDrawingsReachableFromTheirRootPlane(diagramIndex);
    requireRebuiltDerivedReferences(parsed.rootElement, expectations.laneMembers);
    const resultSnapshots = await elementSnapshots(xml, { prefixSources, isUnit: isMergeElement });
    requireSourceContent(
        resultSnapshots,
        expectations.sourceSnapshots,
        expectations.restoredDefaults,
    );
}

/** A parser warning is an unresolved reference, a duplicate id or skipped content, which the parse then leaves out. */
export function requireNoParserWarnings(parsed: ModdleParseResult): void {
    const warnings = parseWarningMessages(parsed.warnings);
    if (warnings.length > 0) refuse("it parses with warnings", warnings);
}

export function requireOneDrawingPerDrawnElement(
    diagramIndex: DiagramIndex,
    drawnByShape: ReadonlySet<string>,
): void {
    const drawnTwice = diagramIndex.elementsDrawnMoreThanOnce();
    if (drawnTwice.length > 0) refuse("elements have more than one shape or edge", drawnTwice);
    const undrawn = [...drawnByShape].filter((id) => !diagramIndex.draws(id));
    if (undrawn.length > 0) refuse("drawn elements have no shape or edge", undrawn);
}

/** Every drawing but an edge lies on the plane `DiagramIndex.subProcessContentsPlane` gives its sub-process. */
export function requireDrawingsOnTheirContainersPlane(diagramIndex: DiagramIndex): void {
    const misplaced = diagramIndex.drawnElements().filter((id) =>
        diagramIndex.drawingsOf(id).some(({ element, planeOwner }) => {
            const drawn = element.bpmnElement as ModdleElement;
            const subProcess = enclosingSubProcessOf(drawn);
            const expected =
                subProcess === undefined || connectionEndsOf(drawn) !== undefined
                    ? undefined
                    : diagramIndex.subProcessContentsPlane(subProcess);
            return expected !== undefined && expected !== planeOwner;
        }),
    );
    if (misplaced.length > 0) {
        refuse("drawings lie on another plane than their sub-process implies", misplaced);
    }
}

/**
 * bpmn-js draws from a root plane only what its owner reaches: a process's
 * contents, or a collaboration's own elements and the processes it reaches (`rootsReachedFrom`).
 */
export function requireDrawingsReachableFromTheirRootPlane(diagramIndex: DiagramIndex): void {
    const unreachable = diagramIndex.diagrams.flatMap((diagram) => {
        const plane = diagram.plane as ModdleElement | undefined;
        const owner = plane?.bpmnElement;
        if (!isModdleElement(owner) || !isRootPlaneOwner(owner)) return [];
        const reachableRoots = rootsReachedFrom(owner);
        return moddleElements(plane?.planeElement)
            .map((drawing) => drawing.bpmnElement)
            .filter(
                (drawn): drawn is ModdleElement =>
                    isModdleElement(drawn) && !isInsideAnyOf(drawn, reachableRoots),
            )
            .map((drawn) => drawn.id);
    });
    if (unreachable.length > 0) {
        refuse("drawings lie on a root plane that does not reach them", unreachable);
    }
}

/** Every edge lies on the plane `edgePlaneOf` names, so bpmn-js finds both its ends there. */
export function requireEdgesOnThePlaneOfTheirEnds(diagramIndex: DiagramIndex): void {
    const planeOfEnd = (end: string) => diagramIndex.planeOf(end);
    const misplaced = diagramIndex.drawnElements().filter((id) =>
        diagramIndex.drawingsOf(id).some(({ element, planeOwner }) => {
            const ends = connectionEndsOf(element.bpmnElement as ModdleElement);
            return ends !== undefined && edgePlaneOf(ends, planeOfEnd) !== planeOwner;
        }),
    );
    if (misplaced.length > 0) {
        refuse("edges lie on a plane that does not draw both of their ends", misplaced);
    }
}

function isRootPlaneOwner(element: ModdleElement): boolean {
    return isType(element, "bpmn:Process") || isType(element, "bpmn:Collaboration");
}

function isInsideAnyOf(element: ModdleElement, roots: ReadonlySet<string>): boolean {
    for (
        let container: ModdleElement | undefined = element;
        container !== undefined;
        container = container.$parent as ModdleElement | undefined
    ) {
        if (container.id !== undefined && roots.has(container.id)) return true;
    }
    return false;
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
    restoredDefaults: ReadonlyMap<string, string>,
): void {
    const differing = [...sourceSnapshots]
        .filter(([id, source]) => {
            const merged = resultSnapshots.get(id);
            return (
                merged === undefined ||
                contentOnItsSide(merged, restoredDefaults.get(id)) !== source.content ||
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

/**
 * The merged element's content without the default flow the build restored on it, so it compares with its side's
 * version; undefined when that default is not the one its start tag names.
 */
function contentOnItsSide(
    merged: ElementSnapshot,
    restoredDefault: string | undefined,
): string | undefined {
    if (restoredDefault === undefined) return merged.content;
    if (merged.attributes.default !== restoredDefault) return undefined;
    return merged.content.replace(` default="${restoredDefault}"`, "");
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
