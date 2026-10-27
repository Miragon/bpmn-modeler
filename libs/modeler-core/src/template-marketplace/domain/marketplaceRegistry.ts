import { MarketplaceSettingsEntry } from "../../kernel/domain/hostPorts";
import {
    marketplaceEntryLabel,
    MarketplaceRegistration,
    parseMarketplaceEntry,
} from "./marketplace";

export interface MarketplaceEntryFailure {
    readonly label: string;
    readonly reason: string;
}

/** `label` is {@link marketplaceEntryLabel}'s, so a log names the entry as the user wrote it. */
export type ParsedMarketplaceEntry =
    | {
          readonly kind: "registered";
          readonly label: string;
          readonly registration: MarketplaceRegistration;
      }
    | { readonly kind: "unparseable"; readonly label: string; readonly reason: string };

export type CachePrune =
    | { readonly kind: "keepOnly"; readonly ids: ReadonlySet<string> }
    | { readonly kind: "suppressed"; readonly unparseable: readonly string[] };

/** The marketplace settings entries, each parsed once, in settings order. */
export class MarketplaceRegistry {
    private constructor(readonly entries: readonly ParsedMarketplaceEntry[]) {}

    static fromEntries(entries: readonly MarketplaceSettingsEntry[]): MarketplaceRegistry {
        return new MarketplaceRegistry(entries.map(parseEntry));
    }

    get registrations(): readonly MarketplaceRegistration[] {
        return this.entries.flatMap((entry) =>
            entry.kind === "registered" ? [entry.registration] : [],
        );
    }

    get failures(): readonly MarketplaceEntryFailure[] {
        return this.entries.flatMap((entry) =>
            entry.kind === "unparseable" ? [{ label: entry.label, reason: entry.reason }] : [],
        );
    }

    /**
     * An unparseable entry has no known id, so a prune could delete the cache
     * of a marketplace that is still registered. A registered id is kept even
     * when its fetch later fails, so its last-good cache survives.
     */
    cachePrune(): CachePrune {
        const unparseable = this.failures.map((failure) => failure.label);
        if (unparseable.length > 0) {
            return { kind: "suppressed", unparseable };
        }
        return {
            kind: "keepOnly",
            ids: new Set(this.registrations.map((registration) => registration.id)),
        };
    }
}

function parseEntry(entry: MarketplaceSettingsEntry): ParsedMarketplaceEntry {
    const label = marketplaceEntryLabel(entry);
    try {
        return { kind: "registered", label, registration: parseMarketplaceEntry(entry) };
    } catch (error) {
        return { kind: "unparseable", label, reason: (error as Error).message };
    }
}
