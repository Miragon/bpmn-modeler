import { type ElementSnapshot, elementSnapshots } from "@miragon/bpmn-modeler-diff";

import type { MergeVersions } from "./computeMerge";
import { type MergeModdle, createMergeModdle } from "./engineModdle";
import { isMergeElement } from "./mergeElements";
import { type DocumentFrame, frameOf } from "./mergedTreeFrame";
import type { MergeSide } from "./mergeResult";

/** What every build from the same versions shares: nothing in it is changed by a build. */
export interface MergeSources {
    readonly mergeModdle: MergeModdle;
    readonly snapshots: Readonly<Record<MergeSide, ReadonlyMap<string, ElementSnapshot>>>;
    readonly frames: {
        readonly base?: DocumentFrame;
        readonly current: DocumentFrame;
        readonly incoming: DocumentFrame;
    };
}

interface PreparedSources {
    readonly current: string;
    readonly incoming: string;
    readonly base?: string;
    readonly sources: Promise<MergeSources>;
}

// A merge view builds once per pick from the same versions object; the strings guard against a reused object.
const preparedByVersions = new WeakMap<MergeVersions, PreparedSources>();

export function mergeSourcesOf(versions: MergeVersions): Promise<MergeSources> {
    const prepared = preparedByVersions.get(versions);
    if (
        prepared?.current === versions.current &&
        prepared.incoming === versions.incoming &&
        prepared.base === versions.base
    ) {
        return prepared.sources;
    }
    const sources = prepareSources(versions);
    preparedByVersions.set(versions, { ...versions, sources });
    sources.catch(() => preparedByVersions.delete(versions));
    return sources;
}

async function prepareSources(versions: MergeVersions): Promise<MergeSources> {
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
