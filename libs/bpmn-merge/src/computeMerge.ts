import { type ElementSnapshot, elementSnapshots } from "@miragon/bpmn-modeler-diff";
import { ENGINE_LABEL, detectEngineWithNamespaceFallback } from "@miragon/bpmn-modeler-types/engine";

import { type ClassifiedVersion, elementStateOf, layoutStateOf } from "./mergeClassification";
import { isMergeElement } from "./mergeElements";
import type { ElementVersion, MergeElement, MergeResult } from "./mergeResult";

export interface MergeVersions {
    readonly base?: string;
    readonly current: string;
    readonly incoming: string;
}

type VersionName = keyof MergeVersions;
type Snapshots = ReadonlyMap<string, ElementSnapshot>;
type SnapshotsOfElement = Partial<Record<VersionName, ElementSnapshot>>;

/**
 * Classifies every merge element of the three versions: its content, parent
 * and lanes against the base for the state, its drawing apart for the layout.
 * Rejects when a version does not parse or the sides are for different engines.
 */
export async function computeMerge(versions: MergeVersions): Promise<MergeResult> {
    requireOneEngine(versions);
    const prefixSources = [versions.current, versions.incoming, versions.base].filter(
        (xml): xml is string => xml !== undefined,
    );
    const [current, incoming, base] = await Promise.all([
        snapshotsOf("current", versions.current, prefixSources),
        snapshotsOf("incoming", versions.incoming, prefixSources),
        versions.base === undefined ? undefined : snapshotsOf("base", versions.base, prefixSources),
    ]);
    const hasBase = base !== undefined;
    const elements = [...typesInMergeOrder(current, incoming, base)].map(([id, type]) =>
        mergeElementOf(
            id,
            type,
            { base: base?.get(id), current: current.get(id), incoming: incoming.get(id) },
            hasBase,
        ),
    );
    return { hasBase, elements };
}

/** A side whose engine is not detected merges with either. */
function requireOneEngine({ current, incoming }: MergeVersions): void {
    const currentEngine = detectEngineWithNamespaceFallback(current);
    const incomingEngine = detectEngineWithNamespaceFallback(incoming);
    if (currentEngine && incomingEngine && currentEngine !== incomingEngine) {
        throw new Error(
            `current is for ${ENGINE_LABEL[currentEngine]} and incoming for ${ENGINE_LABEL[incomingEngine]}: a merge needs one engine`,
        );
    }
}

async function snapshotsOf(
    version: VersionName,
    xml: string,
    prefixSources: readonly string[],
): Promise<Snapshots> {
    try {
        return await elementSnapshots(xml, {
            prefixSources,
            isUnit: isMergeElement,
            rejectWarnings: true,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`${version} does not parse: ${reason}`, { cause: error });
    }
}

/** Current's document order, then incoming's own elements, then base's; the type from the first version holding the element. */
function typesInMergeOrder(
    ...snapshotsByPrecedence: (Snapshots | undefined)[]
): Map<string, string> {
    const types = new Map<string, string>();
    for (const snapshots of snapshotsByPrecedence) {
        for (const [id, snapshot] of snapshots ?? []) {
            if (!types.has(id)) types.set(id, snapshot.type);
        }
    }
    return types;
}

function mergeElementOf(
    id: string,
    type: string,
    snapshots: SnapshotsOfElement,
    hasBase: boolean,
): MergeElement {
    const classified = {
        base: classifiedVersionOf(snapshots.base),
        current: classifiedVersionOf(snapshots.current),
        incoming: classifiedVersionOf(snapshots.incoming),
    };
    const versions: Partial<Record<VersionName, ElementVersion>> = {};
    for (const name of ["base", "current", "incoming"] as const) {
        const snapshot = snapshots[name];
        if (snapshot) versions[name] = elementVersionOf(snapshot);
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
    const key = JSON.stringify([snapshot.content, snapshot.parent ?? null, snapshot.lanes]);
    return snapshot.layout === undefined ? { key } : { key, layout: snapshot.layout };
}

function elementVersionOf(snapshot: ElementSnapshot): ElementVersion {
    return {
        ...(snapshot.parent === undefined ? {} : { parent: snapshot.parent }),
        ...(snapshot.container === undefined ? {} : { container: snapshot.container }),
        lanes: [...snapshot.lanes],
        references: snapshot.references.map(({ property, target, targetPart }) =>
            targetPart === undefined ? { property, target } : { property, target, targetPart },
        ),
        parts: [...snapshot.parts],
        drawn: snapshot.layout !== undefined,
        ...(snapshot.plane === undefined ? {} : { plane: snapshot.plane }),
    };
}
