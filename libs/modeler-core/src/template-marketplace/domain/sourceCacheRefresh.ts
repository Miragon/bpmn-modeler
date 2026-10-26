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
    _cachedSourceIndexes: readonly number[],
    _outcomes: readonly SourceFetchOutcome[],
): SourceSlotAction[] {
    return [];
}
