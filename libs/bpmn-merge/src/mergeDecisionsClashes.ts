import type { DecidedSides } from "./mergeDecisionsSides";
import { MERGE_SIDES, type ElementVersion, type MergeElement, type MergeSide } from "./mergeResult";
import { isProcessReference, type ReferenceIndex } from "./referenceRules";
import type { UnmetRequirement } from "./unmetRequirement";

interface Clash {
    readonly reason: UnmetRequirement;
    readonly involved: readonly [string, string];
}

interface RivalCollaboration {
    readonly rival: MergeElement;
    readonly process: string;
}

/**
 * Elements of the result that cannot stand side by side although each one's references are met: two that hold the
 * same id, and two collaborations from different sides with a pool of one process, of which a diagram draws one.
 */
export function findClashes(
    elements: readonly MergeElement[],
    index: ReferenceIndex,
    sides: DecidedSides,
): readonly Clash[] {
    const present = elements.filter((element) => sides.isPresent(element.id));
    return [...idClashes(present, sides), ...collaborationClashes(present, index, sides)];
}

/** The present collaborations no side holds together with this one whose present pools name a process its own do. */
export function rivalCollaborationsOf(
    collaborationId: string,
    index: ReferenceIndex,
    sides: DecidedSides,
): readonly RivalCollaboration[] {
    const collaboration = index.elementsById.get(collaborationId) as MergeElement;
    const rivals: RivalCollaboration[] = [];
    for (const process of poolProcessesOf(collaborationId, index, sides)) {
        for (const pool of presentDependentsOf(process, index, sides)) {
            const rival = index.elementsById.get(pool.version.parent ?? "");
            if (
                rival !== undefined &&
                rival.id !== collaborationId &&
                namesProcess(pool, process) &&
                sides.isPresent(rival.id) &&
                !shareASide(collaboration, rival) &&
                !rivals.some((known) => known.rival.id === rival.id)
            ) {
                rivals.push({ rival, process });
            }
        }
    }
    return rivals;
}

function shareASide(left: MergeElement, right: MergeElement): boolean {
    return MERGE_SIDES.some(
        (side) => left.versions[side] !== undefined && right.versions[side] !== undefined,
    );
}

function idClashes(present: readonly MergeElement[], sides: DecidedSides): Clash[] {
    const presentIds = new Set(present.map((element) => element.id));
    const holdersByPart = new Map<string, MergeElement[]>();
    for (const element of present) {
        const side = sides.decidedSideOf(element.id) as MergeSide;
        for (const part of element.versions[side]?.parts ?? []) {
            holdersByPart.set(part, [...(holdersByPart.get(part) ?? []), element]);
        }
    }
    const clashes: Clash[] = [];
    const clash = (
        holder: MergeElement,
        target: string,
        part: string,
        heldAs: "part" | "element",
    ) =>
        clashes.push({
            reason: {
                element: { id: holder.id, state: holder.state },
                requirement: { kind: "uniqueId", target, part },
                obstacle: { kind: "idHeldByAnother", heldAs },
            },
            involved: [holder.id, target],
        });
    for (const [part, holders] of holdersByPart) {
        holders.forEach((holder, index) => {
            for (const laterHolder of holders.slice(index + 1)) {
                clash(holder, laterHolder.id, part, "part");
            }
            if (presentIds.has(part) && part !== holder.id) {
                clash(holder, part, part, "element");
            }
        });
    }
    return clashes;
}

function collaborationClashes(
    present: readonly MergeElement[],
    index: ReferenceIndex,
    sides: DecidedSides,
): Clash[] {
    const resultOrder = new Map(present.map((element, position) => [element.id, position]));
    return present.flatMap((element, position) =>
        rivalCollaborationsOf(element.id, index, sides)
            .filter(({ rival }) => (resultOrder.get(rival.id) as number) > position)
            .map(({ rival, process }) => ({
                reason: {
                    element: { id: element.id, state: element.state },
                    requirement: { kind: "soleCollaboration", target: rival.id, process },
                    obstacle: { kind: "processInAnotherCollaboration" },
                },
                involved: [element.id, rival.id] as const,
            })),
    );
}

function poolProcessesOf(
    collaborationId: string,
    index: ReferenceIndex,
    sides: DecidedSides,
): readonly string[] {
    const processes = presentDependentsOf(collaborationId, index, sides)
        .filter((pool) => pool.version.parent === collaborationId)
        .flatMap((pool) =>
            pool.version.references.filter(isProcessReference).map((reference) => reference.target),
        );
    return [...new Set(processes)];
}

function namesProcess(pool: PresentDependent, process: string): boolean {
    return pool.version.references.some(
        (reference) => isProcessReference(reference) && reference.target === process,
    );
}

interface PresentDependent {
    readonly element: MergeElement;
    readonly version: ElementVersion;
}

/** The dependents of the target that are in the result, each with the version the result takes. */
function presentDependentsOf(
    targetId: string,
    index: ReferenceIndex,
    sides: DecidedSides,
): readonly PresentDependent[] {
    return (index.dependentsByTarget.get(targetId) ?? []).flatMap(({ element, side }) => {
        const version = element.versions[side];
        return sides.decidedSideOf(element.id) === side &&
            sides.isPresent(element.id) &&
            version !== undefined
            ? [{ element, version }]
            : [];
    });
}
