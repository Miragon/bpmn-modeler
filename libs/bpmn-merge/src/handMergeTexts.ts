import { type ElementSnapshot, type PrefixedModdle, elementTexts } from "@miragon/bpmn-modeler-diff";

import { handMergeScopeOf } from "./handMerge";
import type { HandMergeTexts } from "./handMergeEligibility";
import { keepsInText } from "./handMergeSplice";
import { cutElementText } from "./handMergeText";
import { isMergeElement } from "./mergeElements";
import type { MergeSide } from "./mergeResult";

export type { HandMergeTexts } from "./handMergeEligibility";

/**
 * The texts a hand merge starts from, for every element base, current and
 * incoming hold with pairwise different texts: each element's content, a
 * container's cut to its start tag, documentation and extension elements.
 * One parse of the base; the sides' texts come from their snapshots.
 */
export async function handMergeTextsOf(
    base: string | undefined,
    snapshotModdle: PrefixedModdle,
    prefixSources: readonly string[],
    snapshots: Readonly<Record<MergeSide, ReadonlyMap<string, ElementSnapshot>>>,
): Promise<ReadonlyMap<string, HandMergeTexts>> {
    const texts = new Map<string, HandMergeTexts>();
    if (base === undefined) return texts;
    const candidates = [...snapshots.current.values()].filter(({ id, content }) => {
        const incoming = snapshots.incoming.get(id)?.content;
        return incoming !== undefined && incoming !== content;
    });
    if (candidates.length === 0) return texts;
    const baseTexts = await elementTexts(
        base,
        candidates.map(({ id }) => id),
        { prefixSources, isUnit: isMergeElement },
    );
    for (const { id, type, content } of candidates) {
        const baseText = baseTexts.get(id);
        if (baseText === undefined) continue;
        const scope = handMergeScopeOf(type);
        const shown = (text: string) =>
            scope === "ownContent"
                ? text
                : cutElementText(snapshotModdle, text, type, keepsInText(scope));
        const [baseShown, current, incoming] = await Promise.all([
            shown(baseText),
            shown(content),
            shown(snapshots.incoming.get(id)!.content),
        ]);
        if (baseShown !== current && baseShown !== incoming && current !== incoming) {
            texts.set(id, { base: baseShown, current, incoming });
        }
    }
    return texts;
}
