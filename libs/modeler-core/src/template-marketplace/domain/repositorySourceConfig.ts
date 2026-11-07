import { MarketplaceProvider } from "../../kernel/domain/modelerSettings";

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

const PUBLIC_HOST_OF_PROVIDER: Readonly<Record<MarketplaceProvider, string>> = {
    github: "github.com",
    gitlab: "gitlab.com",
};

export function publicHostOf(provider: MarketplaceProvider): string {
    return PUBLIC_HOST_OF_PROVIDER[provider];
}

/**
 * The host of `baseUrl` with its port, otherwise the provider's public one.
 * Throws a `TypeError` for a `baseUrl` that is not a URL; the parsers reject
 * one first.
 */
export function repositoryHostOf(provider: MarketplaceProvider, baseUrl?: string): string {
    return baseUrl ? new URL(baseUrl).host : publicHostOf(provider);
}

/**
 * The authenticating host a config sends credentials to, or `undefined` for a
 * source that needs none, so the service's token orchestration stays
 * provider-agnostic. A config's `baseUrl` was validated at parse time, so this
 * cannot throw.
 */
export function hostForConfig(config: GitHubSourceConfig | GitLabSourceConfig): string;

export function hostForConfig(config: RepositorySourceConfig): string | undefined;

export function hostForConfig(config: RepositorySourceConfig): string | undefined {
    return config.kind === "local" ? undefined : repositoryHostOf(config.kind, config.baseUrl);
}
