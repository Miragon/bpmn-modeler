import { FileNotFound } from "../../kernel/domain/errors";
import { RepositoryFacts } from "../../kernel/domain/repositoryFacts";
import { RepositoryAccessError } from "./repositoryAccessError";

/** Beside `marketplace.json`, where repository hosts show a repository's description. */
export const MARKETPLACE_README = "README.md";

/** What fetching one thing about a marketplace brought: its cached copy is replaced, removed or kept. */
export type AboutFetch<T> =
    | { readonly kind: "found"; readonly value: T }
    | { readonly kind: "absent" }
    | { readonly kind: "failed"; readonly reason: string };

/** What a marketplace's detail shows besides its templates, fetched with its manifest. */
export interface MarketplaceAboutFetch {
    readonly readme: AboutFetch<string>;
    readonly repository: AboutFetch<RepositoryFacts>;
}

/**
 * Read with the access its manifest was just read with, so a 404 says the
 * thing is missing, not that a token is needed.
 */
export function aboutFetchFailureOf<T>(error: unknown): AboutFetch<T> {
    if (
        error instanceof FileNotFound ||
        (error instanceof RepositoryAccessError && error.status === 404)
    ) {
        return { kind: "absent" };
    }
    return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
}
