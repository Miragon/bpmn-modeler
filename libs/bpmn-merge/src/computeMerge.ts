import { type ElementSnapshot, elementSnapshots } from "@miragon/bpmn-modeler-diff";

import { type ClassifiedVersion, elementStateOf, layoutStateOf } from "./mergeClassification";
import { isMergeElement } from "./mergeElements";
import { parseFailure } from "./mergeRefusal";
import {
    type ElementVersion,
    type MergeElement,
    type MergeResult,
    lanesKeyOf,
} from "./mergeResult";
import {
    type MergeVersions,
    VERSION_NAMES,
    type VersionName,
    prefixSourcesOf,
    requireMergeableVersions,
} from "./mergeVersions";
import { versionKeysOf } from "./versionKey";
import { VersionSnapshots } from "./versionSnapshots";

export type { MergeVersions } from "./mergeVersions";

type SnapshotsOfVersions = Partial<Record<VersionName, VersionSnapshots>>;

/**
 * Classifies every merge element of the three versions: its content, parent
 * and lanes against the base for the state, its drawing apart for the layout.
 * Rejects what `requireMergeableVersions` refuses.
 */
export async function computeMerge(versions: MergeVersions): Promise<MergeResult> {
    await requireMergeableVersions(versions);
    const prefixSources = prefixSourcesOf(versions);
    const [current, incoming, base] = await Promise.all([
        snapshotsOf("current", versions.current, prefixSources),
        snapshotsOf("incoming", versions.incoming, prefixSources),
        versions.base === undefined ? undefined : snapshotsOf("base", versions.base, prefixSources),
    ]);
    const hasBase = base !== undefined;
    const elements = [...typesInMergeOrder(current, incoming, base)].map(([id, type]) =>
        mergeElementOf(id, type, { base, current, incoming }, hasBase),
    );
    return { hasBase, versionKeys: versionKeysOf(versions), elements };
}

async function snapshotsOf(
    version: VersionName,
    xml: string,
    prefixSources: readonly string[],
): Promise<VersionSnapshots> {
    try {
        return VersionSnapshots.of(
            await elementSnapshots(xml, {
                prefixSources,
                isUnit: isMergeElement,
                rejectWarnings: true,
            }),
        );
    } catch (error) {
        throw parseFailure(version, error);
    }
}

/** Current's document order, then incoming's own elements, then base's; the type from the first version holding the element. */
function typesInMergeOrder(
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

function mergeElementOf(
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
    return snapshot.layout === undefined ? { key } : { key, layout: snapshot.layout };
}
