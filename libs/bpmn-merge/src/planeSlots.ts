import { type DiagramIndex, ROOT_PLANE, planeKindOf } from "./diagramIndex";
import type { MergeSide } from "./mergeResult";

/**
 * Where a plane goes in the result. A sub-process's plane is its own slot;
 * a collaboration's plane and the planes of the processes its participants
 * name share one root slot, whichever side wraps a process in a pool.
 */
export class PlaneSlots {
    private readonly rootOf = new Map<string, string>();

    constructor(private readonly indexes: Readonly<Record<MergeSide, DiagramIndex>>) {
        for (const [collaboration, process] of [
            ...indexes.current.collaborationProcesses,
            ...indexes.incoming.collaborationProcesses,
        ]) {
            const collaborationRoot = this.root(collaboration);
            const processRoot = this.root(process);
            if (collaborationRoot !== processRoot) this.rootOf.set(processRoot, collaborationRoot);
        }
    }

    /** One document's slots, as if it were merged with itself. */
    static ofDocument(index: DiagramIndex): PlaneSlots {
        return new PlaneSlots({ current: index, incoming: index });
    }

    slotOf(planeOwner: string): string {
        const kind = planeKindOf(planeOwner, this.indexes.current, this.indexes.incoming);
        return `${kind}:${kind === ROOT_PLANE ? this.root(planeOwner) : planeOwner}`;
    }

    isRoot(slot: string): boolean {
        return slot.startsWith(`${ROOT_PLANE}:`);
    }

    private root(owner: string): string {
        const parent = this.rootOf.get(owner);
        return parent === undefined ? owner : this.root(parent);
    }
}
