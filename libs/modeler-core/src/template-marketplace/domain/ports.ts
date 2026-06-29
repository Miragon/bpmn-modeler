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
 * Construction parameters shared by every {@link RepositorySource}. `path` is
 * the subtree to scan (`""` = whole repo/root, used when only
 * {@link RepositorySource.fetchFile} is needed, e.g. reading `marketplace.json`
 * at the root). `kind` is the discriminant the factory dispatches on.
 */
interface RepositorySourceConfigBase {
    readonly path: string;
}

/**
 * A subtree of a public GitHub repository. `ref` absent means "resolve the
 * default branch".
 */
export interface GitHubSourceConfig extends RepositorySourceConfigBase {
    readonly kind: "github";
    readonly owner: string;
    readonly repo: string;
    readonly ref?: string;
}

/**
 * A subtree of a local on-disk folder (decision: a marketplace can live as a
 * plain `marketplace.json` folder, no repository required). `rootDir` is the
 * absolute folder holding the manifest; `path` resolves relative to it.
 */
export interface LocalSourceConfig extends RepositorySourceConfigBase {
    readonly kind: "local";
    readonly rootDir: string;
}

export type RepositorySourceConfig = GitHubSourceConfig | LocalSourceConfig;

/**
 * Builds a {@link RepositorySource} for a given config. Injected into the
 * service so the provider adapters (and their `HttpClient` / `WorkspacePort`)
 * stay in infrastructure; the factory dispatches on {@link RepositorySourceConfig.kind}.
 */
export type RepositorySourceFactory = (config: RepositorySourceConfig) => RepositorySource;
