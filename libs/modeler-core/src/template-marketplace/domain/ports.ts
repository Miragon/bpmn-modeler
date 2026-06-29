/**
 * Domain port abstracting a remote repository that hosts template files.
 *
 * One adapter per provider (`GitHubSource` for Slice 1; `GitLabSource` later)
 * hides the differing tree/raw API shapes behind this seam, so the marketplace
 * service resolves and fetches templates without naming any provider.
 */
export interface RepositorySource {
    /**
     * Lists the repo-relative `.json` paths under this source's `path@ref`,
     * recursively. Returns the paths in the repo's own vocabulary so
     * {@link fetchFile} can round-trip them.
     */
    listTemplateFiles(): Promise<string[]>;

    /**
     * Fetches the raw UTF-8 content of one repo-relative file at this source's
     * `ref`.
     */
    fetchFile(repoPath: string): Promise<string>;
}

/**
 * Construction parameters for a single {@link RepositorySource}. `path` is the
 * subtree to scan (`""` = whole repo, used when only {@link RepositorySource.fetchFile}
 * is needed, e.g. reading `marketplace.json` at the repo root). `ref` absent
 * means "resolve the default branch".
 */
export interface RepositorySourceConfig {
    readonly owner: string;
    readonly repo: string;
    readonly ref?: string;
    readonly path: string;
}

/**
 * Builds a {@link RepositorySource} for a given repo/subtree. Injected into the
 * service so the provider adapter and its `HttpClient` stay in infrastructure.
 */
export type RepositorySourceFactory = (config: RepositorySourceConfig) => RepositorySource;
