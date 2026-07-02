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
 * A subtree of a GitHub repository. `ref` absent means "resolve the default
 * branch". `token`, when set, authenticates the request (private repos, or a
 * higher rate limit) — it is resolved by the *service* from {@link TokenStorePort}
 * and rides on the config so the adapter never reads secret storage itself.
 */
export interface GitHubSourceConfig extends RepositorySourceConfigBase {
    readonly kind: "github";
    readonly owner: string;
    readonly repo: string;
    readonly ref?: string;
    readonly token?: string;
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

/**
 * The authenticating host a config would send credentials to, or `undefined`
 * for a source that needs none (a local folder). The single place the
 * host-per-config mapping lives, so the service's token orchestration stays
 * provider-agnostic and slice 3 (GitLab / a `baseUrl`) extends only here.
 */
export function hostForConfig(config: RepositorySourceConfig): string | undefined {
    return config.kind === "github" ? "github.com" : undefined;
}

/**
 * Thrown by a {@link RepositorySource} when the host denies access in an
 * auth-shaped way (401/403/404) — GitHub returns 404 for a private repo the
 * caller cannot see, so 404 is treated as "may need a token" too. The service
 * catches this to drive a prompt-and-retry instead of string-parsing messages.
 *
 * `resource` is the `"owner/repo"` the request targeted; `rateLimited` flags a
 * 403 whose body reads like a rate-limit rejection (a token is still a valid
 * remedy, so it only changes the wording, not whether we prompt).
 *
 * Invariant (D9): the message must never contain the token.
 */
export class RepositoryAccessError extends Error {
    constructor(
        readonly host: string,
        readonly status: number,
        readonly resource: string,
        readonly rateLimited: boolean,
    ) {
        super(`${host} denied access to ${resource} (HTTP ${status})`);
        this.name = "RepositoryAccessError";
    }
}
