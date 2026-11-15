import {
    type ElementSnapshot,
    buildFlowOrder,
    elementSnapshots,
    sortIdsByOrder,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";

import { type MergeModdle, createMergeModdle } from "./engineModdle";
import { isMergeElement } from "./mergeElements";
import { parseFailure } from "./mergeRefusal";
import { type DocumentFrame, frameOf, frameOfDefinitions } from "./mergedTreeFrame";
import type { MergeResult, MergeSide, VersionKeys } from "./mergeResult";
import { type MergeVersions, VERSION_NAMES, requireMergeableVersions } from "./mergeVersions";
import { versionKeysOf } from "./versionKey";

/**
 * What every build of one merge shares, parsed once: the caller keeps it for
 * the merge's lifetime and passes it to each build. Nothing in it is changed
 * by a build.
 */
export interface MergeSources {
    readonly versions: MergeVersions;
    readonly versionKeys: VersionKeys;
    readonly mergeModdle: MergeModdle;
    readonly snapshots: Readonly<Record<MergeSide, ReadonlyMap<string, ElementSnapshot>>>;
    readonly frames: {
        readonly base?: DocumentFrame;
        readonly current: DocumentFrame;
        readonly incoming: DocumentFrame;
    };
    /** Each side's flow elements from start to end, as a stepper walks them. */
    readonly flowOrders: Readonly<Record<MergeSide, readonly string[]>>;
    /** Each side's element names by id, for a view that names an element its canvas does not draw. */
    readonly names: Readonly<Record<MergeSide, ReadonlyMap<string, string>>>;
}

/** Refuses, naming the version, what `computeMerge` refuses. */
export async function prepareMergeSources(versions: MergeVersions): Promise<MergeSources> {
    await requireMergeableVersions(versions);
    const mergeModdle = await createMergeModdle(versions);
    const [current, incoming] = await Promise.all([
        versionSnapshots(mergeModdle, "current", versions.current),
        versionSnapshots(mergeModdle, "incoming", versions.incoming),
    ]);
    const [currentLayout, incomingLayout, baseFrame] = await Promise.all([
        sideLayout(mergeModdle, versions.current),
        sideLayout(mergeModdle, versions.incoming),
        versions.base === undefined ? undefined : frameOf(mergeModdle, versions.base),
    ]);
    return {
        versions: {
            current: versions.current,
            incoming: versions.incoming,
            ...(versions.base === undefined ? {} : { base: versions.base }),
        },
        versionKeys: versionKeysOf(versions),
        mergeModdle,
        snapshots: { current, incoming },
        frames: {
            current: currentLayout.frame,
            incoming: incomingLayout.frame,
            ...(baseFrame === undefined ? {} : { base: baseFrame }),
        },
        flowOrders: { current: currentLayout.flowOrder, incoming: incomingLayout.flowOrder },
        names: { current: currentLayout.names, incoming: incomingLayout.names },
    };
}

async function sideLayout(
    mergeModdle: MergeModdle,
    xml: string,
): Promise<{
    readonly frame: DocumentFrame;
    readonly flowOrder: readonly string[];
    readonly names: ReadonlyMap<string, string>;
}> {
    const definitions = (await mergeModdle.moddle.fromXML(xml)).rootElement;
    const positions = buildFlowOrder(definitions);
    const names = new Map<string, string>();
    walkContainment(definitions, ({ id, name }) => {
        if (typeof id === "string" && typeof name === "string" && name.trim() !== "") {
            names.set(id, name);
        }
    });
    return {
        frame: await frameOfDefinitions(mergeModdle, definitions),
        flowOrder: sortIdsByOrder([...positions.keys()], positions),
        names,
    };
}

async function versionSnapshots(
    mergeModdle: MergeModdle,
    side: MergeSide,
    xml: string,
): Promise<ReadonlyMap<string, ElementSnapshot>> {
    try {
        return await elementSnapshots(xml, {
            prefixSources: mergeModdle.prefixSources,
            isUnit: isMergeElement,
            rejectWarnings: true,
        });
    } catch (error) {
        throw parseFailure(side, error);
    }
}

/** The ids alone cannot tell a version whose content changed, so the fingerprints decide. */
export function requireSourcesOf(result: MergeResult, sources: MergeSources): void {
    const differing = VERSION_NAMES.filter(
        (name) => result.versionKeys[name] !== sources.versionKeys[name],
    );
    if (differing.length > 0) {
        throw new Error(
            `The merge decisions were made for other versions: ${differing.join(", ")}`,
        );
    }
}
