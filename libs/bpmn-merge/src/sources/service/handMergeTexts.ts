import {
    type ElementSnapshot,
    type PrefixedModdle,
    elementTexts,
} from "@miragon/bpmn-modeler-diff";

import { handMergeScopeOf } from "../../decide/domain/handMerge";
import type { HandMergeTexts } from "../../decide/domain/handMergeEligibility";
import { keepsInText } from "../domain/handMergeSplice";
import { cutElementText } from "./handMergeText";
import { isMergeElement } from "../../kernel/domain/mergeElements";
import type { MergeSide } from "../../kernel/domain/mergeResult";

export type { HandMergeTexts } from "../../decide/domain/handMergeEligibility";

/**
 * The texts a hand merge starts from, for every element base, current and
 * incoming hold as one type with pairwise different texts: each element's
 * content, a container's cut to its start tag, documentation and extension
 * elements. A hand merge cannot change the type, so a type that differs
 * leaves nothing to merge. One parse of the base; the sides' texts come from
 * their snapshots.
 */
export async function handMergeTextsOf(
    base: string | undefined,
    snapshotModdle: PrefixedModdle,
    prefixSources: readonly string[],
    snapshots: Readonly<Record<MergeSide, ReadonlyMap<string, ElementSnapshot>>>,
): Promise<ReadonlyMap<string, HandMergeTexts>> {
    const texts = new Map<string, HandMergeTexts>();
    if (base === undefined) return texts;
    const candidates = [...snapshots.current.values()].flatMap((current) => {
        const incoming = snapshots.incoming.get(current.id);
        return incoming !== undefined &&
            incoming.type === current.type &&
            incoming.content !== current.content
            ? [{ current, incoming }]
            : [];
    });
    if (candidates.length === 0) return texts;
    const baseTexts = await elementTexts(
        base,
        candidates.map(({ current }) => current.id),
        { prefixSources, isUnit: isMergeElement },
    );
    for (const { current, incoming } of candidates) {
        const { id, type } = current;
        const baseText = baseTexts.get(id);
        if (baseText === undefined || baseText.type !== type) continue;
        const scope = handMergeScopeOf(type);
        const shown = (text: string) =>
            scope === "ownContent"
                ? text
                : cutElementText(snapshotModdle, text, type, keepsInText(scope));
        const [baseShown, currentShown, incomingShown] = await Promise.all([
            shown(baseText.text),
            shown(current.content),
            shown(incoming.content),
        ]);
        if (
            baseShown !== currentShown &&
            baseShown !== incomingShown &&
            currentShown !== incomingShown
        ) {
            texts.set(id, { base: baseShown, current: currentShown, incoming: incomingShown });
        }
    }
    return texts;
}
