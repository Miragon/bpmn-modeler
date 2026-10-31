import { expandHomePath, MarketplaceLocation, TemplateSource } from "./marketplace";
import {
    GitHubSourceConfig,
    GitLabSourceConfig,
    hostForConfig,
    RepositorySourceConfig,
} from "./ports";

type RemoteLocation = Exclude<MarketplaceLocation, { readonly kind: "local" }>;

/** Where the marketplace's `marketplace.json` is read: the root of its location. */
export function manifestConfig(location: MarketplaceLocation): RepositorySourceConfig {
    return configAt(location, "");
}

/**
 * A relative source resolves against the marketplace's location; the other
 * kinds name their own. `homeDir` expands a `~` local source, which the parser
 * keeps raw because only the host knows the home directory.
 */
export function sourceConfig(
    source: TemplateSource,
    marketplaceLocation: MarketplaceLocation,
    homeDir: string,
): RepositorySourceConfig {
    switch (source.kind) {
        case "relative":
            return configAt(marketplaceLocation, source.path);
        case "github":
        case "gitlab":
            return remoteConfigAt(source, source.path);
        case "local":
            return { kind: "local", rootDir: expandHomePath(source.path, homeDir), path: "" };
    }
}

/**
 * The distinct hosts whose sources the manifest declares private, in source
 * order. `visibility` is a hint: an undeclared private source is only found
 * when its fetch is denied.
 */
export function declaredPrivateHosts(sources: readonly TemplateSource[]): readonly string[] {
    const hosts = new Set<string>();
    for (const source of sources) {
        if (
            (source.kind === "github" || source.kind === "gitlab") &&
            source.visibility === "private"
        ) {
            hosts.add(hostForConfig(remoteConfigAt(source, source.path)));
        }
    }
    return [...hosts];
}

/**
 * A credential-free, log-safe rendering of a source config. Never reads
 * `token`, so logging it can never leak a secret by construction.
 * {@link hostForConfig} supplies the host so self-hosted origins read the
 * same as the public ones.
 */
export function describeSourceConfig(config: RepositorySourceConfig): string {
    const path = config.path ? ` path "${config.path}"` : "";
    if (config.kind === "local") {
        return `local folder ${config.rootDir}${path}`;
    }
    const repo = config.kind === "github" ? `${config.owner}/${config.repo}` : config.projectPath;
    const ref = config.ref ? `@${config.ref}` : "";
    return `${config.kind} ${hostForConfig(config)}/${repo}${ref}${path}`;
}

export function sourceIdentity(_config: RepositorySourceConfig): string {
    return "";
}

function configAt(location: MarketplaceLocation, path: string): RepositorySourceConfig {
    return location.kind === "local"
        ? { kind: "local", rootDir: location.rootDir, path }
        : remoteConfigAt(location, path);
}

/** Builds a fresh config so a source's own fields (`include`, `visibility`) never reach the adapter. */
function remoteConfigAt(
    location: RemoteLocation,
    path: string,
): GitHubSourceConfig | GitLabSourceConfig {
    if (location.kind === "github") {
        return {
            kind: "github",
            owner: location.owner,
            repo: location.repo,
            ref: location.ref,
            path,
            baseUrl: location.baseUrl,
        };
    }
    return {
        kind: "gitlab",
        projectPath: location.projectPath,
        ref: location.ref,
        path,
        baseUrl: location.baseUrl,
    };
}
