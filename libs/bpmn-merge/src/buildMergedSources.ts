import { type ElementSnapshot, elementSnapshots } from "@miragon/bpmn-modeler-diff";

import { type MergeModdle, createMergeModdle } from "./engineModdle";
import { isMergeElement } from "./mergeElements";
import { type DocumentFrame, frameOf } from "./mergedTreeFrame";
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
}

/** Refuses, naming the version, what `computeMerge` refuses. */
export async function prepareMergeSources(versions: MergeVersions): Promise<MergeSources> {
    await requireMergeableVersions(versions);
    const mergeModdle = await createMergeModdle(versions);
    const [current, incoming] = await Promise.all([
        versionSnapshots(mergeModdle, "current", versions.current),
        versionSnapshots(mergeModdle, "incoming", versions.incoming),
    ]);
    const [currentFrame, incomingFrame, baseFrame] = await Promise.all([
        frameOf(mergeModdle, versions.current),
        frameOf(mergeModdle, versions.incoming),
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
            current: currentFrame,
            incoming: incomingFrame,
            ...(baseFrame === undefined ? {} : { base: baseFrame }),
        },
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
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${side} does not parse: ${message}`);
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
