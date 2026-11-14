import { type ElementSnapshot, elementSnapshots } from "@miragon/bpmn-modeler-diff";

import type { MergeVersions } from "./computeMerge";
import { type MergeModdle, createMergeModdle } from "./engineModdle";
import { isMergeElement } from "./mergeElements";
import { type DocumentFrame, frameOf } from "./mergedTreeFrame";
import type { MergeSide } from "./mergeResult";

/**
 * What every build of one merge shares, parsed once: the caller keeps it for
 * the merge's lifetime and passes it to each build. Nothing in it is changed
 * by a build.
 */
export interface MergeSources {
    readonly versions: MergeVersions;
    readonly mergeModdle: MergeModdle;
    readonly snapshots: Readonly<Record<MergeSide, ReadonlyMap<string, ElementSnapshot>>>;
    readonly frames: {
        readonly base?: DocumentFrame;
        readonly current: DocumentFrame;
        readonly incoming: DocumentFrame;
    };
}

/** Rejects a version that parses with any warning, naming it. */
export async function prepareMergeSources(versions: MergeVersions): Promise<MergeSources> {
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
        throw new Error(`${side} does not parse: ${message}`, { cause: error });
    }
}
