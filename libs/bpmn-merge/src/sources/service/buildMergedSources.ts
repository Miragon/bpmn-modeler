import {
    type ElementSnapshot,
    buildFlowOrder,
    createDocumentModdle,
    elementSnapshots,
    sortIdsByOrder,
    walkContainment,
} from "@miragon/bpmn-modeler-diff";

import { createMergeModdle } from "./engineModdle";
import { handMergeTextsOf } from "./handMergeTexts";
import { frameOf, frameOfDefinitions } from "./documentFrames";
import { isMergeElement } from "../../kernel/domain/mergeElements";
import { parseFailure } from "../../classify/domain/mergeRefusal";
import type { DocumentFrame, MergeModdle, MergeSources } from "../domain/mergeSources";
import { shownNameOf } from "../domain/sideText";
import type { MergeResult, MergeSide } from "../../kernel/domain/mergeResult";
import {
    type MergeVersions,
    VERSION_NAMES,
    prefixSourcesOf,
    requireMergeableVersions,
} from "../../classify/service/mergeVersions";
import { versionKeysOf } from "../../classify/domain/versionKey";

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
