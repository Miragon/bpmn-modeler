import { elementSnapshots } from "@miragon/bpmn-modeler-diff";

import { isMergeElement } from "../../kernel/domain/mergeElements";
import type { MergeResult } from "../../kernel/domain/mergeResult";
import { mergeElementOf, typesInMergeOrder } from "../domain/mergeElementOf";
import { parseFailure } from "../domain/mergeRefusal";
import {
    type MergeVersions,
    type VersionName,
    prefixSourcesOf,
    requireMergeableVersions,
} from "./mergeVersions";
import { versionKeysOf } from "../domain/versionKey";
import { VersionSnapshots } from "../domain/versionSnapshots";

export type { MergeVersions } from "./mergeVersions";

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
