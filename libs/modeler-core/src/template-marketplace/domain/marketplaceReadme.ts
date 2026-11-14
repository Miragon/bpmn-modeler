import { FileNotFound } from "../../kernel/domain/errors";
import { RepositoryAccessError } from "./repositoryAccessError";

/** Beside `marketplace.json`, where repository hosts show a repository's description. */
export const MARKETPLACE_README = "README.md";

/** What fetching a marketplace's README brought: a cached one is replaced, removed or kept. */
export type MarketplaceReadmeFetch =
    | { readonly kind: "found"; readonly content: string }
    | { readonly kind: "absent" }
    | { readonly kind: "failed"; readonly reason: string };

/**
 * Read with the access its manifest was just read with, so a 404 says the file
 * is missing, not that a token is needed.
 */
export function readmeFetchFailureOf(error: unknown): MarketplaceReadmeFetch {
    if (
        error instanceof FileNotFound ||
        (error instanceof RepositoryAccessError && error.status === 404)
    ) {
        return { kind: "absent" };
    }
    return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
}
