import type { ElementSnapshot } from "@miragon/bpmn-modeler-diff";

import { elementVersionOf } from "./elementVersion";
import type { ElementVersion } from "./mergeResult";

const PROCESS_REF = "bpmn:Participant#processRef";

/** One version's element snapshots, read together for what one element's snapshot cannot tell. */
export class VersionSnapshots {
    private constructor(
        readonly byId: ReadonlyMap<string, ElementSnapshot>,
        private readonly processesDrawnWithoutAPool: ReadonlySet<string>,
    ) {}

    static of(byId: ReadonlyMap<string, ElementSnapshot>): VersionSnapshots {
        return new VersionSnapshots(byId, processesDrawnWithoutAPool(byId));
    }

    /**
     * Whether the version draws the element: with a shape, an edge or a plane of its own, or, for a
     * process no pool names, with a drawing of something it holds on a collaboration's plane, from
     * which bpmn-js draws a process with lanes or one only a participant without an id names.
     */
    draws(id: string): boolean {
        return this.byId.get(id)?.layout !== undefined || this.processesDrawnWithoutAPool.has(id);
    }

    versionOf(id: string): ElementVersion | undefined {
        const snapshot = this.byId.get(id);
        return snapshot && elementVersionOf(snapshot, this.draws(id));
    }
}

function processesDrawnWithoutAPool(byId: ReadonlyMap<string, ElementSnapshot>): Set<string> {
    const snapshots = [...byId.values()];
    const rootOf = (snapshot: ElementSnapshot): ElementSnapshot => {
        const parent = snapshot.parent === undefined ? undefined : byId.get(snapshot.parent);
        return parent === undefined ? snapshot : rootOf(parent);
    };
    const holderOf = (lane: ElementSnapshot): ElementSnapshot | undefined => {
        const parent = lane.parent === undefined ? undefined : byId.get(lane.parent);
        return parent?.type === "bpmn:Lane" ? holderOf(parent) : parent;
    };
    // bpmn-js reaches a process through its own lane sets only, not through a sub-process's.
    const withLanes = new Set(
        snapshots
            .filter(({ type }) => type === "bpmn:Lane")
            .map((lane) => holderOf(lane))
            .flatMap((holder) => (holder?.type === "bpmn:Process" ? [holder.id] : [])),
    );
    const pooled = new Set(
        snapshots
            .filter(({ type }) => type === "bpmn:Participant")
            .flatMap((participant) =>
                processesNamedBy(participant).map((process) =>
                    collaborationProcessKey(participant.parent, process),
                ),
            ),
    );
    const drawn = new Set<string>();
    for (const snapshot of snapshots) {
        const planeOwner = snapshot.plane === undefined ? undefined : byId.get(snapshot.plane);
        if (planeOwner?.type !== "bpmn:Collaboration") continue;
        const process = rootOf(snapshot);
        if (process.type !== "bpmn:Process") continue;
        const reached =
            withLanes.has(process.id) || processesNamedBy(planeOwner).includes(process.id);
        if (reached && !pooled.has(collaborationProcessKey(planeOwner.id, process.id))) {
            drawn.add(process.id);
        }
    }
    return drawn;
}

/** A participant without an id is no unit of its own: its collaboration's snapshot holds its process reference. */
function processesNamedBy(snapshot: ElementSnapshot): string[] {
    return snapshot.references
        .filter(({ property }) => property === PROCESS_REF)
        .map(({ target }) => target);
}

function collaborationProcessKey(collaboration: string | undefined, process: string): string {
    return JSON.stringify([collaboration, process]);
}
