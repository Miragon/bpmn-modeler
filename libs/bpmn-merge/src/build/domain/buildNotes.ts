import {
    type MergeBuildNote,
    type MergeBuildNoteContent,
    elementsNamedBy,
} from "@miragon/bpmn-modeler-types/domain";

import type { UndrawnEdge } from "./connectionEnds";
import type { MergeResolution } from "../../decide/domain/mergeDecisions";
import { drawingContainersOf, poolsByProcess } from "../../decide/domain/mergeDecisionsLayout";
import {
    type LayoutState,
    MERGE_SIDES,
    type MergeElement,
    type MergeResult,
    type MergeSide,
    chosenVersionOf,
} from "../../kernel/domain/mergeResult";
import { isEdgeEnd } from "../../decide/domain/referenceRules";
import {
    type RestoredFlowDefault,
    connectionsOn,
    keptAgainstRemoval,
    removedWith,
} from "../../decide/domain/removedWith";

export type BuildNote = MergeBuildNote;

/** A note as the build finds it, before it names its elements. */
export type BuildNoteContent = MergeBuildNoteContent;

/** A repair as its note carries it: its `kind` as `repair`, every other field as it is. */
export type NoteRepairOf<Repair extends { readonly kind: string }> = Repair extends unknown
    ? {
          readonly [Key in Exclude<keyof Repair, "kind"> | "repair"]: Key extends keyof Repair
              ? Repair[Key]
              : Repair["kind"];
      }
    : never;

/** A note's repair as the layout repair records it: its `repair` as `kind`, every other field as it is. */
export type RepairOf<NoteRepair extends { readonly repair: string }> = NoteRepair extends unknown
    ? {
          readonly [
              Key in Exclude<keyof NoteRepair, "repair"> | "kind"
          ]: Key extends keyof NoteRepair ? NoteRepair[Key] : NoteRepair["repair"];
      }
    : never;

/** What the build learnt while it wrote the result, from which `buildNotesOf` notes what to check. */
export interface BuildFindings {
    readonly result: MergeResult;
    readonly resolution: MergeResolution;
    readonly undrawnEdges: readonly UndrawnEdge[];
    readonly layoutSpotNotes: readonly BuildNoteContent[];
    readonly flowDefaults: readonly RestoredFlowDefault[];
    readonly restoredDefaults: ReadonlyMap<string, string>;
    readonly layoutOf: (id: string, side: MergeSide) => string | undefined;
    readonly frameNotes: readonly BuildNoteContent[];
}

/** Every note of a build, in the order the merge view lists them, each with the elements it names. */
export function buildNotesOf(findings: BuildFindings): BuildNote[] {
    const { result, resolution } = findings;
    return [
        ...flowNotDrawnNotes(findings.undrawnEdges),
        ...findings.layoutSpotNotes,
        ...restoredWithoutRemovedWithNotes(result, resolution),
        ...defaultFlowNotRestoredNotes(findings.flowDefaults, findings.restoredDefaults),
        ...layoutChangedByBothNotes(result, resolution, findings.layoutOf),
        ...findings.frameNotes,
    ].map((note) => ({ ...note, named: elementsNamedBy(note) }));
}

/** One note per edge the build leaves out of the drawing, naming its ends by role. */
export function flowNotDrawnNotes(undrawn: readonly UndrawnEdge[]): BuildNoteContent[] {
    return undrawn.map(({ id, ends }) => ({ kind: "flowNotDrawn", id, ...ends }));
}

/**
 * A drawn flow's ends, when the flow and its ends are drawn from both sides
 * together: each side may have moved one end without routing the flow.
 */
function endsDrawnApartOf(
    element: MergeElement,
    resolution: MergeResolution,
    drawnFrom: (id: string) => MergeSide | undefined,
): string[] | undefined {
    const version = chosenVersionOf(element, (id) => resolution.elements[id]);
    if (!version || resolution.layout[element.id] === undefined) return undefined;
    const ends = [...new Set(version.references.filter(isEdgeEnd).map(({ target }) => target))];
    const sides = new Set([element.id, ...ends].map(drawnFrom));
    return MERGE_SIDES.every((side) => sides.has(side)) ? ends : undefined;
}

/**
 * An element kept against the other side's removal, while the boundary events
 * the other side removed with it, or flows that connect it or them on its own
 * side, stay out: each is decided on its own, so what was removed with the
 * element stays removed unless kept with it (`pickWithRemoved`).
 */
export function restoredWithoutRemovedWithNotes(
    result: MergeResult,
    resolution: MergeResolution,
): BuildNoteContent[] {
    const leftOut = (candidates: readonly MergeElement[]) =>
        candidates.filter((candidate) => !isInResultOf(candidate, resolution));
    return result.elements.flatMap((element): BuildNoteContent[] => {
        const side = resolution.elements[element.id];
        if (side === undefined || !keptAgainstRemoval(element, side)) return [];
        const boundaryEvents = leftOut(removedWith(result.elements, element, side).boundaryEvents);
        const connected = [element, ...boundaryEvents].flatMap((end) =>
            connectionsOn(result.elements, end.id, side),
        );
        const connections = leftOut([...new Set(connected)]).map(({ id }) => id);
        if (connections.length === 0 && boundaryEvents.length === 0) return [];
        const note = { kind: "restoredWithoutRemovedWith", id: element.id, connections } as const;
        return [
            boundaryEvents.length === 0
                ? note
                : { ...note, boundaryEvents: boundaryEvents.map(({ id }) => id) },
        ];
    });
}

function isInResultOf(element: MergeElement, resolution: MergeResolution): boolean {
    return chosenVersionOf(element, (id) => resolution.elements[id]) !== undefined;
}

/** A flow kept against its removal that its source in the result does not name as its default. */
function defaultFlowNotRestoredNotes(
    flowDefaults: readonly RestoredFlowDefault[],
    restored: ReadonlyMap<string, string>,
): BuildNoteContent[] {
    return flowDefaults.flatMap((flowDefault): BuildNoteContent[] => {
        const note = {
            kind: "defaultFlowNotRestored",
            id: flowDefault.source,
            flow: flowDefault.flow,
        } as const;
        if (flowDefault.kind === "otherDefaultKept") {
            return [{ ...note, keptDefault: flowDefault.keptDefault }];
        }
        return restored.get(flowDefault.source) === flowDefault.flow ? [] : [note];
    });
}

/**
 * Elements the base and both sides draw, each side apart from the base and from the other: the
 * result keeps one side's drawing. Members linked through a host, a parent, the pool drawing a
 * parent process or a flow's end form one group, split by the side the result draws them from.
 * A note lists only a part's outermost members, as a container stands for its contents and an
 * end for its flows. A flow drawn from another side than one of its ends is left out: when each
 * side moved one end, its waypoints differ on both sides without either side routing it, and
 * `layoutSpotNotes` names it if it no longer meets an end. Lanes link nothing: one can hold most
 * of a diagram.
 * Without a base nothing is noted, as every element the sides draw differently counts as
 * changed by both.
 */
export function layoutChangedByBothNotes(
    result: MergeResult,
    resolution: MergeResolution,
    layoutOf: (id: string, side: MergeSide) => string | undefined,
): BuildNoteContent[] {
    const drawnFrom = drawnFromOf(result, resolution);
    const keptSides = new Map<string, MergeSide>();
    for (const element of result.elements) {
        const keptSide = resolution.layout[element.id];
        if (
            keptSide !== undefined &&
            changedApartByBoth(element, layoutOf) &&
            !endsDrawnApartOf(element, resolution, drawnFrom)
        ) {
            keptSides.set(element.id, keptSide);
        }
    }
    const links = memberLinksOf(result, resolution, keptSides);
    const groupOf = groupsOf(links);
    const parts = new Map<string, { readonly keptSide: MergeSide; readonly ids: string[] }>();
    for (const [id, keptSide] of keptSides) {
        const key = `${groupOf(id)} ${keptSide}`;
        const part = parts.get(key) ?? { keptSide, ids: [] };
        part.ids.push(id);
        parts.set(key, part);
    }
    return [...parts.values()].map(({ keptSide, ids }): BuildNoteContent => {
        const inPart = new Set(ids);
        const outermost = ids.filter((id) => !links.get(id)?.some((link) => inPart.has(link)));
        return { kind: "layoutChangedByBoth", ids: outermost, keptSide };
    });
}

function changedApartByBoth(
    { id, layout, versions }: MergeElement,
    layoutOf: (id: string, side: MergeSide) => string | undefined,
): boolean {
    return (
        layout === "bothChanged" &&
        versions.base?.drawn === true &&
        versions.current?.drawn === true &&
        versions.incoming?.drawn === true &&
        layoutOf(id, "current") !== layoutOf(id, "incoming")
    );
}

/** Each member's containers and flow ends that are members too. */
function memberLinksOf(
    result: MergeResult,
    resolution: MergeResolution,
    members: ReadonlyMap<string, MergeSide>,
): ReadonlyMap<string, readonly string[]> {
    const sideInResult = (id: string) => resolution.elements[id];
    const pools = poolsByProcess(result.elements, sideInResult);
    const links = new Map<string, readonly string[]>();
    for (const element of result.elements) {
        if (!members.has(element.id)) continue;
        const version = chosenVersionOf(element, sideInResult);
        const containers = drawingContainersOf(version, pools)
            .filter(({ kind }) => kind !== "lane")
            .map(({ id }) => id);
        const ends = (version?.references ?? []).filter(isEdgeEnd).map(({ target }) => target);
        links.set(
            element.id,
            [...containers, ...ends].filter((id) => members.has(id)),
        );
    }
    return links;
}

/** The connected sets of `links`, each named by one of its ids. */
function groupsOf(links: ReadonlyMap<string, readonly string[]>): (id: string) => string {
    const representatives = new Map<string, string>([...links.keys()].map((id) => [id, id]));
    const groupOf = (id: string): string => {
        const representative = representatives.get(id) ?? id;
        if (representative === id) return id;
        const group = groupOf(representative);
        representatives.set(id, group);
        return group;
    };
    for (const [id, linked] of links) {
        for (const other of linked) representatives.set(groupOf(other), groupOf(id));
    }
    return groupOf;
}

/** The side an element of the result is drawn from, undefined when both sides draw it alike or it is not drawn. */
function drawnFromOf(
    result: MergeResult,
    resolution: MergeResolution,
): (id: string) => MergeSide | undefined {
    const layoutsById = new Map<string, LayoutState>(
        result.elements.map(({ id, layout }) => [id, layout]),
    );
    return (id) => (layoutsById.get(id) === "unchanged" ? undefined : resolution.layout[id]);
}
