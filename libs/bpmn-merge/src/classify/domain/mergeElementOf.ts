import type { ElementSnapshot } from "@miragon/bpmn-modeler-diff/domain";

import {
    type ClassifiedVersion,
    type ClassifiedVersions,
    elementStateOf,
    layoutStateOf,
    moveStateOf,
} from "./mergeClassification";
import {
    type ElementVersion,
    type LayoutState,
    type MergeElement,
    lanesKeyOf,
} from "../../kernel/domain/mergeResult";
import { VERSION_NAMES, type VersionName } from "./versionNames";
import type { VersionSnapshots } from "./versionSnapshots";

type SnapshotsOfVersions = Partial<Record<VersionName, VersionSnapshots>>;

/** Current's document order, then incoming's own elements, then base's; the type from the first version holding the element. */
export function typesInMergeOrder(
    ...snapshotsByPrecedence: (VersionSnapshots | undefined)[]
): Map<string, string> {
    const types = new Map<string, string>();
    for (const snapshots of snapshotsByPrecedence) {
        for (const [id, snapshot] of snapshots?.byId ?? []) {
            if (!types.has(id)) types.set(id, snapshot.type);
        }
    }
    return types;
}

export function mergeElementOf(
    id: string,
    type: string,
    snapshots: SnapshotsOfVersions,
    hasBase: boolean,
): MergeElement {
    const classified = {
        base: classifiedVersionOf(snapshots.base?.byId.get(id)),
        current: classifiedVersionOf(snapshots.current?.byId.get(id)),
        incoming: classifiedVersionOf(snapshots.incoming?.byId.get(id)),
    };
    const versions: Partial<Record<VersionName, ElementVersion>> = {};
    for (const name of VERSION_NAMES) {
        const version = snapshots[name]?.versionOf(id);
        if (version) versions[name] = version;
    }
    return {
        id,
        type,
        state: elementStateOf(classified, hasBase),
        layout: layoutStateOf(classified),
        ...movedOf(classified),
        versions,
    };
}

function classifiedVersionOf(snapshot: ElementSnapshot | undefined): ClassifiedVersion | undefined {
    if (!snapshot) return undefined;
    const key = JSON.stringify([
        snapshot.content,
        snapshot.parent ?? null,
        lanesKeyOf(snapshot.lanes),
    ]);
    return {
        key,
        ...(snapshot.layout === undefined ? {} : { layout: snapshot.layout }),
        ...(snapshot.place === undefined ? {} : { place: snapshot.place }),
    };
}

function movedOf(classified: ClassifiedVersions): { moved?: LayoutState } {
    const moved = moveStateOf(classified);
    return moved === undefined ? {} : { moved };
}
