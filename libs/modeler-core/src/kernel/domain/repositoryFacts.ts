import { MarketplaceProvider } from "./modelerSettings";

/**
 * As the host detected it from the repository's license file: an SPDX id it
 * recognised, a file it did not, or no file at all.
 */
export type RepositoryLicense =
    | { readonly kind: "known"; readonly id: string; readonly name: string }
    | { readonly kind: "other" }
    | { readonly kind: "none" };

/** What a marketplace's host says about its repository, as of the last update. */
export interface RepositoryFacts {
    readonly host: MarketplaceProvider;
    readonly stars?: number;
    /** Absent when the host did not say. */
    readonly license?: RepositoryLicense;
}
