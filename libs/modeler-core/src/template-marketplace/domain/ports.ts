/**
 * Domain port abstracting a remote repository that hosts template files.
 *
 * One adapter per provider (`GitHubSource`, `GitLabSource`, `LocalFileSource`)
 * hides the differing tree/raw API shapes behind this seam, so the marketplace
 * service resolves and fetches templates without naming any provider.
 */
export interface RepositorySource {
    /**
     * Paths are returned in the repo's own vocabulary so {@link fetchFile} can
     * round-trip them.
     */
    listTemplateFiles(): Promise<string[]>;

    fetchFile(repoPath: string): Promise<string>;
}

/**
 * `path` is the subtree to scan; `""` = whole repo/root, used when only
 * {@link RepositorySource.fetchFile} is needed (e.g. `marketplace.json` at the
 * root).
 */
interface RepositorySourceConfigBase {
    readonly path: string;
}

/**
 * A subtree of a GitHub repository. `token` is resolved by the *service* from
 * {@link TokenStorePort} and rides on the config so the adapter never reads
 * secret storage itself.
 *
 * `baseUrl` (no trailing slash) targets a GitHub Enterprise instance: its API
 * root is `<baseUrl>/api/v3` and there is no enterprise raw host, so every blob
 * fetch goes through the Contents API. Absent means public `api.github.com`.
 */
export interface GitHubSourceConfig extends RepositorySourceConfigBase {
    readonly kind: "github";
    readonly owner: string;
    readonly repo: string;
    readonly ref?: string;
    readonly token?: string;
    readonly baseUrl?: string;
}

/**
 * A subtree of a GitLab project. `projectPath` is the full namespace path
 * (`group/subgroup/project`) as one string rather than an owner/repo split,
 * because nested subgroups make a two-field split lossy. `token` authenticates
 * via the `PRIVATE-TOKEN` header.
 */
export interface GitLabSourceConfig extends RepositorySourceConfigBase {
    readonly kind: "gitlab";
    readonly projectPath: string;
    readonly ref?: string;
    readonly token?: string;
    readonly baseUrl?: string;
}

/**
 * A subtree of a local on-disk folder (a marketplace can live as a plain
 * `marketplace.json` folder, no repository required). `path` resolves relative
 * to `rootDir`.
 */
export interface LocalSourceConfig extends RepositorySourceConfigBase {
    readonly kind: "local";
    readonly rootDir: string;
}

export type RepositorySourceConfig = GitHubSourceConfig | GitLabSourceConfig | LocalSourceConfig;

/**
 * Injected into the service so the provider adapters (and their `HttpClient` /
 * `WorkspacePort`) stay in infrastructure.
 */
export type RepositorySourceFactory = (config: RepositorySourceConfig) => RepositorySource;

/**
 * The authenticating host a config sends credentials to, or `undefined` for a
 * source that needs none. The single place the host-per-config mapping lives,
 * so the service's token orchestration stays provider-agnostic.
 *
 * `baseUrl` is validated with `new URL` at parse time, so re-parsing it here
 * cannot throw. `URL` is a standard global — no host import, arch-test safe.
 */
export function hostForConfig(config: RepositorySourceConfig): string | undefined {
    if (config.kind === "local") {
        return undefined;
    }
    if (config.baseUrl) {
        return new URL(config.baseUrl).host;
    }
    return config.kind === "github" ? "github.com" : "gitlab.com";
}

/**
 * Thrown by a {@link RepositorySource} when the host denies access in an
 * auth-shaped way (401/403/404, plus 429 for GitLab's rate limit). GitHub and
 * GitLab both return 404 for a private repo the caller cannot see, so 404 is
 * treated as "may need a token" too. The service catches this to drive a
 * prompt-and-retry instead of string-parsing messages.
 *
 * `rateLimited` only changes the wording, not whether we prompt (a token
 * remains a valid remedy either way).
 *
 * Invariant: the message must never contain the token.
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
