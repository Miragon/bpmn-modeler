import { MarketplaceContentType } from "./marketplace";

export interface FetchedTemplateFile {
    readonly contentType: MarketplaceContentType;
    readonly repoPath: string;
    readonly content: string;
}

/** `source` is the `sourceIdentity` of the source listed at `sourceIndex`. */
export type SourceFetchOutcome =
    | {
          readonly kind: "fetched";
          readonly sourceIndex: number;
          readonly source: string;
          readonly files: readonly FetchedTemplateFile[];
      }
    | { readonly kind: "failed"; readonly sourceIndex: number; readonly source: string };

/** `source` is `undefined` for a slot cached before slots recorded their source. */
export interface CachedSourceSlot {
    readonly sourceIndex: number;
    readonly source: string | undefined;
}

export type SourceSlotAction =
    | {
          readonly kind: "replace";
          readonly sourceIndex: number;
          readonly source: string;
          readonly files: readonly FetchedTemplateFile[];
      }
    | { readonly kind: "keep"; readonly sourceIndex: number }
    | {
          readonly kind: "remove";
          readonly sourceIndex: number;
          readonly reason: "unlisted" | "otherSource";
      };

export function planSourceCacheRefresh(
    cachedSlots: readonly CachedSourceSlot[],
    outcomes: readonly SourceFetchOutcome[],
): SourceSlotAction[] {
    const listedSourceIndexes = new Set(outcomes.map((outcome) => outcome.sourceIndex));
    const removals = cachedSlots
        .filter(({ sourceIndex }) => !listedSourceIndexes.has(sourceIndex))
        .map(({ sourceIndex }): SourceSlotAction => ({
            kind: "remove",
            sourceIndex,
            reason: "unlisted",
        }));
    return [...outcomes.map(slotActionFor), ...removals];
}

function slotActionFor(outcome: SourceFetchOutcome): SourceSlotAction {
    return outcome.kind === "fetched"
        ? {
              kind: "replace",
              sourceIndex: outcome.sourceIndex,
              source: outcome.source,
              files: outcome.files,
          }
        : { kind: "keep", sourceIndex: outcome.sourceIndex };
}
