import { MarketplaceContentType } from "./marketplace";

export interface FetchedTemplateFile {
    readonly contentType: MarketplaceContentType;
    readonly repoPath: string;
    readonly content: string;
}

export type SourceFetchOutcome =
    | {
          readonly kind: "fetched";
          readonly sourceIndex: number;
          readonly files: readonly FetchedTemplateFile[];
      }
    | { readonly kind: "failed"; readonly sourceIndex: number };

export type SourceSlotAction =
    | {
          readonly kind: "replace";
          readonly sourceIndex: number;
          readonly files: readonly FetchedTemplateFile[];
      }
    | { readonly kind: "keep"; readonly sourceIndex: number }
    | { readonly kind: "remove"; readonly sourceIndex: number };

export function planSourceCacheRefresh(
    cachedSourceIndexes: readonly number[],
    outcomes: readonly SourceFetchOutcome[],
): SourceSlotAction[] {
    const listedSourceIndexes = new Set(outcomes.map((outcome) => outcome.sourceIndex));
    const removals = cachedSourceIndexes
        .filter((sourceIndex) => !listedSourceIndexes.has(sourceIndex))
        .map((sourceIndex): SourceSlotAction => ({ kind: "remove", sourceIndex }));
    return [...outcomes.map(slotActionFor), ...removals];
}

function slotActionFor(outcome: SourceFetchOutcome): SourceSlotAction {
    return outcome.kind === "fetched"
        ? { kind: "replace", sourceIndex: outcome.sourceIndex, files: outcome.files }
        : { kind: "keep", sourceIndex: outcome.sourceIndex };
}
