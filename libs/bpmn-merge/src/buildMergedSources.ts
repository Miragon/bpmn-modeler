import {
    type ElementSnapshot,
    type PrefixedModdle,
    buildFlowOrder,
    createDocumentModdle,
    elementSnapshots,
    sortIdsByOrder,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";

import { type MergeModdle, createMergeModdle } from "./engineModdle";
import { type HandMergeTexts, handMergeTextsOf } from "./handMergeTexts";
import { isMergeElement } from "./mergeElements";
import { parseFailure } from "./mergeRefusal";
import { type DocumentFrame, frameOf, frameOfDefinitions } from "./mergedTreeFrame";
import { shownNameOf } from "./sideText";
import type { MergeResult, MergeSide, VersionKeys } from "./mergeResult";
import {
    type MergeVersions,
    VERSION_NAMES,
    prefixSourcesOf,
    requireMergeableVersions,
} from "./mergeVersions";
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
    /** Each side's types by id, of the elements and of the parts inside them. */
    readonly types: Readonly<Record<MergeSide, ReadonlyMap<string, string>>>;
    /** The three texts of each element a hand merge can start from (`handMergeTextsOf`). */
    readonly handMergeTexts: ReadonlyMap<string, HandMergeTexts>;
    /** The moddle the snapshots read elements with: the versions' prefixes, no engine descriptor. */
    readonly snapshotModdle: PrefixedModdle;
}

/** Refuses, naming the version, what `computeMerge` refuses. */
export async function prepareMergeSources(versions: MergeVersions): Promise<MergeSources> {
    await requireMergeableVersions(versions);
    const [mergeModdle, snapshotModdle] = await Promise.all([
        createMergeModdle(versions),
        createDocumentModdle(prefixSourcesOf(versions)),
    ]);
    const [current, incoming] = await Promise.all([
        versionSnapshots(mergeModdle, "current", versions.current),
        versionSnapshots(mergeModdle, "incoming", versions.incoming),
    ]);
    const [currentLayout, incomingLayout, baseFrame, handMergeTexts] = await Promise.all([
        sideLayout(mergeModdle, versions.current),
        sideLayout(mergeModdle, versions.incoming),
        versions.base === undefined ? undefined : frameOf(mergeModdle, versions.base),
        handMergeTextsOf(versions.base, snapshotModdle, mergeModdle.prefixSources, {
            current,
            incoming,
        }),
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
        types: { current: currentLayout.types, incoming: incomingLayout.types },
        handMergeTexts,
        snapshotModdle,
    };
}

async function sideLayout(
    mergeModdle: MergeModdle,
    xml: string,
): Promise<{
    readonly frame: DocumentFrame;
    readonly flowOrder: readonly string[];
    readonly names: ReadonlyMap<string, string>;
    readonly types: ReadonlyMap<string, string>;
}> {
    const definitions = (await mergeModdle.moddle.fromXML(xml)).rootElement;
    const positions = buildFlowOrder(definitions);
    const names = new Map<string, string>();
    const types = new Map<string, string>();
    walkContainment(definitions, ({ id, name, $type }) => {
        if (typeof id !== "string") return;
        types.set(id, $type);
        const shown = shownNameOf(name);
        if (shown !== undefined) names.set(id, shown);
    });
    return {
        frame: await frameOfDefinitions(mergeModdle, definitions),
        flowOrder: sortIdsByOrder([...positions.keys()], positions),
        names,
        types,
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
