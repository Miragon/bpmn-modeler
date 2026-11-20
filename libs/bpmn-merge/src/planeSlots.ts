import { type DiagramIndex, type PlaneKind, ROOT_PLANE, planeKindOf } from "./diagramIndex";
import type { MergeSide } from "./mergeResult";

/** A place in the result's drawing: a sub-process's plane, or a root slot named after its outermost owner. */
export class PlaneSlot {
    /** The value that defines the slot; a map across two `PlaneSlots` keys by it, not by the instance. */
    readonly key: string;

    constructor(
        private readonly kind: PlaneKind,
        owner: string,
    ) {
        this.key = `${kind}:${owner}`;
    }

    get isRoot(): boolean {
        return this.kind === ROOT_PLANE;
    }

    equals(other: PlaneSlot): boolean {
        return this.key === other.key;
    }
}

/**
 * Where a plane goes in the result. A sub-process's plane is its own slot;
 * a collaboration's plane and the planes of the processes its participants
 * name share one root slot, whichever side wraps a process in a pool. Hands
 * out one `PlaneSlot` per place, so a slot keys a map, but only among the
 * slots of one `PlaneSlots`; slots of two are compared with `equals`.
 */
export class PlaneSlots {
    private readonly rootOf = new Map<string, string>();
    private readonly handedOut = new Map<string, PlaneSlot>();

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

    slotOf(planeOwner: string): PlaneSlot {
        const kind = planeKindOf(planeOwner, this.indexes.current, this.indexes.incoming);
        const owner = kind === ROOT_PLANE ? this.root(planeOwner) : planeOwner;
        const fresh = new PlaneSlot(kind, owner);
        const slot = this.handedOut.get(fresh.key) ?? fresh;
        this.handedOut.set(slot.key, slot);
        return slot;
    }

    holds(slot: PlaneSlot, planeOwner: string): boolean {
        return this.slotOf(planeOwner).equals(slot);
    }

    private root(owner: string): string {
        const parent = this.rootOf.get(owner);
        return parent === undefined ? owner : this.root(parent);
    }
}
