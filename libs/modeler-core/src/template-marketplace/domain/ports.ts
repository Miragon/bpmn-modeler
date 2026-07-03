/**
 * Domain port abstracting a remote repository that hosts template files.
 *
 * One adapter per provider (`GitHubSource`, `GitLabSource`, `LocalFileSource`)
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
 *
 * `baseUrl` (no trailing slash — normalized once in the parsers) targets a
 * GitHub Enterprise instance: its API root is `<baseUrl>/api/v3` and there is no
 * enterprise raw host, so every blob fetch goes through the Contents API.
 * Absent means the public `api.github.com` / `raw.githubusercontent.com`.
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
 * because nested subgroups make a two-field split lossy. `ref` absent means the
 * GitLab API's own default branch (no lookup needed — unlike GitHub). `token`,
 * when set, authenticates via the `PRIVATE-TOKEN` header. `baseUrl` (normalized,
 * no trailing slash) targets a self-hosted GitLab; absent means `gitlab.com`.
 */
export interface GitLabSourceConfig extends RepositorySourceConfigBase {
    readonly kind: "gitlab";
    readonly projectPath: string;
    readonly ref?: string;
    readonly token?: string;
    readonly baseUrl?: string;
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

export type RepositorySourceConfig = GitHubSourceConfig | GitLabSourceConfig | LocalSourceConfig;

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
 * provider-agnostic — a per-host token then keys the same way for github.com,
 * gitlab.com, and every self-hosted `baseUrl` origin.
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
 * auth-shaped way (401/403/404, plus 429 for GitLab's rate limit) — GitHub and
 * GitLab both return 404 for a private repo the caller cannot see, so 404 is
 * treated as "may need a token" too. The service catches this to drive a
 * prompt-and-retry instead of string-parsing messages.
 *
 * `resource` is the `owner/repo` (GitHub) or project path (GitLab) the request
 * targeted; `rateLimited` flags a rate-limit rejection (GitHub's 403-with-a-
 * rate-limit body, or GitLab's dedicated 429). A token is still a valid remedy,
 * so it only changes the wording, not whether we prompt.
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
