import { MarketplaceContentType } from "./marketplace";

export interface FetchedTemplateFile {
    readonly contentType: MarketplaceContentType;
    readonly repoPath: string;
    readonly content: string;
}

/** `sourceIdentity` is that of the source listed at `sourceIndex`. */
export type SourceFetchOutcome =
    | {
          readonly kind: "fetched";
          readonly sourceIndex: number;
          readonly sourceIdentity: string;
          readonly files: readonly FetchedTemplateFile[];
      }
    | { readonly kind: "failed"; readonly sourceIndex: number; readonly sourceIdentity: string };

/** `sourceIdentity` is `undefined` for a slot cached before slots recorded their source. */
export interface CachedSourceSlot {
    readonly sourceIndex: number;
    readonly sourceIdentity: string | undefined;
}

export type SourceSlotAction =
    | {
          readonly kind: "replace";
          readonly sourceIndex: number;
          readonly sourceIdentity: string;
          readonly files: readonly FetchedTemplateFile[];
      }
    | { readonly kind: "keep"; readonly sourceIndex: number }
    | {
          readonly kind: "remove";
          readonly sourceIndex: number;
          readonly reason: "unlisted" | "otherSource";
      };

/**
 * A slot belongs to the source listed at its index: one that holds the files of
 * another source counts as empty, so a reorder never serves a source twice.
 */
export function planSourceCacheRefresh(
    cachedSlots: readonly CachedSourceSlot[],
    outcomes: readonly SourceFetchOutcome[],
): SourceSlotAction[] {
    const cachedIdentityAt = new Map(
        cachedSlots.map(({ sourceIndex, sourceIdentity }) => [sourceIndex, sourceIdentity]),
    );
    const listedSourceIndexes = new Set(outcomes.map((outcome) => outcome.sourceIndex));
    const removals = cachedSlots
        .filter(({ sourceIndex }) => !listedSourceIndexes.has(sourceIndex))
        .map(({ sourceIndex }): SourceSlotAction => ({
            kind: "remove",
            sourceIndex,
            reason: "unlisted",
        }));
    return [
        ...outcomes.flatMap((outcome) =>
            slotActionsFor(outcome, cachedIdentityAt.get(outcome.sourceIndex)),
        ),
        ...removals,
    ];
}

/**
 * A slot without a recorded source counts as the listed source's own: treating
 * it as another's would empty every slot on the first offline update.
 */
function slotActionsFor(
    outcome: SourceFetchOutcome,
    cachedIdentity: string | undefined,
): SourceSlotAction[] {
    const { sourceIndex, sourceIdentity } = outcome;
    const emptyOtherSource: SourceSlotAction[] =
        cachedIdentity !== undefined && cachedIdentity !== sourceIdentity
            ? [{ kind: "remove", sourceIndex, reason: "otherSource" }]
            : [];
    if (outcome.kind === "failed") {
        return emptyOtherSource.length > 0 ? emptyOtherSource : [{ kind: "keep", sourceIndex }];
    }
    return [
        ...emptyOtherSource,
        { kind: "replace", sourceIndex, sourceIdentity, files: outcome.files },
    ];
}

/**
 * What a slot records about its files: whose they are, and the generation
 * directory that holds them. A replace writes a new generation and then this
 * record, so the files the record names are always complete.
 */
export interface SourceSlotRecord {
    readonly sourceIdentity: string;
    readonly generation: number;
}

/** `undefined` for text that holds no record, such as a torn write. */
export function parseSourceSlotRecord(text: string): SourceSlotRecord | undefined {
    let value: { sourceIdentity?: unknown; generation?: unknown } | null;
    try {
        value = JSON.parse(text);
    } catch {
        return undefined;
    }
    const { sourceIdentity, generation } = value ?? {};
    return typeof sourceIdentity === "string" && Number.isSafeInteger(generation)
        ? { sourceIdentity, generation: generation as number }
        : undefined;
}

export function formatSourceSlotRecord({ sourceIdentity, generation }: SourceSlotRecord): string {
    return JSON.stringify({ sourceIdentity, generation });
}

/** Never the live generation, so its files stay served until the new record is written. */
export function nextSourceSlotRecord(
    current: SourceSlotRecord | undefined,
    sourceIdentity: string,
): SourceSlotRecord {
    return { sourceIdentity, generation: (current?.generation ?? 0) + 1 };
}
