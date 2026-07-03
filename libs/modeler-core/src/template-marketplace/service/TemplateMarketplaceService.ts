import {
    NotifierPort,
    SettingsPort,
    TokenPromptPort,
    TokenStorePort,
} from "../../shared/domain/hostPorts";
import {
    InvalidMarketplaceError,
    marketplaceEntryLabel,
    MarketplaceLocation,
    MarketplaceRegistration,
    parseMarketplace,
    parseMarketplaceEntry,
    parseMarketplaceUrl,
    TemplateSource,
} from "../domain/marketplace";
import {
    hostForConfig,
    RepositoryAccessError,
    RepositorySourceConfig,
    RepositorySourceFactory,
} from "../domain/ports";
import { MarketplaceCache } from "../infrastructure/MarketplaceCache";

// The pointer file every registered marketplace repo must hold at its root.
const MARKETPLACE_MANIFEST = "marketplace.json";

/**
 * Bookkeeping for one user-initiated command so a host is prompted for a token
 * at most once, even when a run spans many marketplaces (an `updateAll`) or a
 * marketplace's manifest and its several same-host sources all fail auth. A
 * decline is recorded here too (the host is added regardless of outcome), so
 * the run remembers it and does not nag.
 */
interface PromptRun {
    readonly promptedHosts: Set<string>;
}

/**
 * Orchestrates the marketplace lifecycle: resolve a registration's
 * `marketplace.json`, fan out over its sources, fetch every template, and cache
 * it for the render pipeline.
 *
 * Resilience is split by intent (decision D8). For an explicit *add*, a missing
 * or malformed `marketplace.json` throws so the controller can report it and
 * skip persisting the registration. For a background *update*, every error is
 * swallowed and logged so one bad marketplace never blocks the others — or the
 * modeler. Per-source failures are always swallowed: a 404/rate-limit on one
 * source keeps the last-good cache and warns, leaving sibling sources intact.
 *
 * Private repos are reached with per-host personal access tokens: the service
 * resolves a stored token onto the source config before each fetch and, on an
 * auth-shaped failure ({@link RepositoryAccessError}), prompts once per host per
 * run and retries. The token lives only in {@link TokenStorePort}; it is only
 * ever placed on a remote (github/gitlab) config the adapter sends to that
 * config's own host, and never reaches settings, the cache, logs, or error
 * messages (D9). The orchestration is provider-agnostic — {@link hostForConfig}
 * is the single place a config maps to the host its token is keyed by, so
 * github.com, gitlab.com, and self-hosted `baseUrl` origins are all handled the
 * same way.
 */
export class TemplateMarketplaceService {
    /**
     * @param sourceFactory Builds a provider adapter for a repo/subtree.
     * @param cache Local store the render pipeline reads from.
     * @param settings Reads the persisted list of registered marketplaces.
     * @param notifier User-facing logging for the warn-and-continue path.
     * @param tokens Encrypted per-host token store; read to authenticate, written
     *   on a granted prompt (a set overwrites — that is token rotation).
     * @param tokenPrompt Asks the user for a token; a decline returns `undefined`
     *   and never aborts a run.
     * @param homeDir Absolute home directory, injected because the host-agnostic
     *   core cannot read it; used to expand `~` in a `provider: "local"` source.
     */
    constructor(
        private readonly sourceFactory: RepositorySourceFactory,
        private readonly cache: MarketplaceCache,
        private readonly settings: SettingsPort,
        private readonly notifier: NotifierPort,
        private readonly tokens: TokenStorePort,
        private readonly tokenPrompt: TokenPromptPort,
        private readonly homeDir: string,
    ) {}

    /**
     * Registers and fetches a single marketplace from a pasted URL (GitHub /
     * GitLab repo or a local folder). Self-hosted `baseUrl` marketplaces are
     * object entries in settings and never flow through this string path (§10).
     *
     * @throws {InvalidMarketplaceError} if the URL is not a supported repo/path
     *   or its `marketplace.json` is missing/malformed — the caller must not
     *   persist a registration that cannot be fetched.
     */
    async addMarketplace(url: string): Promise<void> {
        await this.fetchAndCache(parseMarketplaceUrl(url), { promptedHosts: new Set() });
    }

    /**
     * Re-fetches every registered marketplace on demand (decision D7: no silent
     * auto-refresh). Never throws — a failing marketplace is logged and skipped
     * so the others still refresh and the modeler stays usable offline. One
     * {@link PromptRun} spans all marketplaces so the token prompt appears at
     * most once per host across the whole update.
     */
    async updateAll(): Promise<void> {
        const run: PromptRun = { promptedHosts: new Set() };
        for (const entry of this.settings.getTemplateMarketplaces()) {
            // Label first (never throws) so a marketplace whose *entry* fails to
            // parse can still be named in the warning below.
            const label = marketplaceEntryLabel(entry);
            try {
                await this.fetchAndCache(parseMarketplaceEntry(entry), run);
            } catch (error) {
                this.notifier.logWarning(
                    `Skipped template marketplace "${label}": ${(error as Error).message}`,
                );
            }
        }
    }

    /** The merge input handed to {@link BpmnElementTemplatesService}. */
    getCachedTemplatePaths(): Promise<string[]> {
        return this.cache.getCachedTemplatePaths();
    }

    /**
     * Fetches `marketplace.json`, resolves its sources, and caches every
     * template. Manifest-level failures propagate (the marketplace is unusable);
     * source-level failures are logged and skipped to preserve last-good data.
     * Declared-private sources are batch-prompted up front so the tokens are in
     * the store before the per-source fetches begin.
     */
    private async fetchAndCache(
        registration: MarketplaceRegistration,
        run: PromptRun,
    ): Promise<void> {
        const sources = parseMarketplace(JSON.parse(await this.readManifest(registration, run)));
        await this.ensureTokensForPrivateSources(sources, run);

        for (let index = 0; index < sources.length; index++) {
            try {
                await this.cacheSource(registration, sources[index], index, run);
            } catch (error) {
                this.notifier.logWarning(
                    `Skipped a source of "${registration.url}": ${(error as Error).message}`,
                );
            }
        }
    }

    /**
     * Reads the manifest from the marketplace repo root, mapping a fetch failure
     * to {@link InvalidMarketplaceError} so the caller's error path is uniform.
     * Goes through {@link withAuthRetry} so a private marketplace prompts for a
     * token here — the token then also covers the relative sources it points at.
     */
    private async readManifest(
        registration: MarketplaceRegistration,
        run: PromptRun,
    ): Promise<string> {
        const baseConfig = this.configFor(registration.location, "");
        try {
            return await this.withAuthRetry(baseConfig, run, (config) =>
                this.sourceFactory(config).fetchFile(MARKETPLACE_MANIFEST),
            );
        } catch (error) {
            throw new InvalidMarketplaceError(
                `could not read ${MARKETPLACE_MANIFEST} from "${registration.url}": ${(error as Error).message}`,
            );
        }
    }

    /**
     * Resolves one source to a concrete fetch and caches its `.json` files. A
     * relative source resolves against the marketplace's own location (the repo
     * or local folder it was registered from); a github source names its own
     * repo. The registration only pins the relative case — an external source
     * carries its own coordinates. The whole listing+fetch runs under
     * {@link withAuthRetry}, so a mid-source auth failure prompts and retries.
     */
    private async cacheSource(
        registration: MarketplaceRegistration,
        source: TemplateSource,
        index: number,
        run: PromptRun,
    ): Promise<void> {
        const baseConfig = this.configForSource(registration, source);
        await this.withAuthRetry(baseConfig, run, async (config) => {
            const repository = this.sourceFactory(config);
            for (const repoPath of await repository.listTemplateFiles()) {
                const content = await repository.fetchFile(repoPath);
                await this.cache.writeTemplate(registration.id, index, repoPath, content);
            }
        });
    }

    /**
     * Runs `task` with a stored token (if any) resolved onto the config, then —
     * on an auth-shaped {@link RepositoryAccessError} — prompts once for the
     * host, stores a granted token, and retries the task exactly once with it.
     * A non-auth error, or an unauthenticated host (a local folder), propagates
     * unchanged. On decline or a second denial the failure is rewritten into a
     * user-facing message via {@link accessFailure} (the raw error text is not
     * shown — it would say "HTTP 404" for a private repo).
     */
    private async withAuthRetry<T>(
        baseConfig: RepositorySourceConfig,
        run: PromptRun,
        task: (config: RepositorySourceConfig) => Promise<T>,
    ): Promise<T> {
        const host = hostForConfig(baseConfig);
        const stored = host ? await this.tokens.getToken(host) : undefined;
        try {
            return await task(this.withToken(baseConfig, stored));
        } catch (error) {
            if (!(error instanceof RepositoryAccessError) || host === undefined) {
                throw error;
            }
            const hadToken = stored !== undefined;
            const fresh = await this.promptOncePerRun(host, run, hadToken, error);
            if (fresh === undefined) {
                throw this.accessFailure(error, hadToken);
            }
            try {
                return await task(this.withToken(baseConfig, fresh));
            } catch (retryError) {
                if (retryError instanceof RepositoryAccessError) {
                    throw this.accessFailure(retryError, true);
                }
                throw retryError;
            }
        }
    }

    /**
     * Prompts for a token for `host` unless this run already prompted it, adding
     * the host to the run regardless of outcome so a decline is remembered. A
     * granted token is stored immediately (overwrite = rotation) so later
     * same-host fetches pick it up on their first attempt.
     */
    private async promptOncePerRun(
        host: string,
        run: PromptRun,
        hadToken: boolean,
        error: RepositoryAccessError,
    ): Promise<string | undefined> {
        if (run.promptedHosts.has(host)) {
            return undefined;
        }
        run.promptedHosts.add(host);
        const token = await this.tokenPrompt.promptForToken(
            host,
            this.promptReason(hadToken, error),
        );
        if (token !== undefined) {
            await this.tokens.setToken(host, token);
        }
        return token;
    }

    /**
     * Prompts up front for every distinct host that has a *declared*-private
     * remote source and no stored token, so those tokens are in the store before
     * the per-source fetches run and `withAuthRetry` picks them up first try.
     * `visibility` is only a hint (D2): undeclared-private sources still get the
     * failure-driven prompt instead. `hostForConfig` already yields the baseUrl
     * host, so a self-hosted GHE / GitLab source extends this for free.
     */
    private async ensureTokensForPrivateSources(
        sources: TemplateSource[],
        run: PromptRun,
    ): Promise<void> {
        const hosts = new Set<string>();
        for (const source of sources) {
            const isPrivateRemote =
                (source.kind === "github" || source.kind === "gitlab") &&
                source.visibility === "private";
            if (isPrivateRemote) {
                const host = hostForConfig(this.configForSource(undefined, source));
                if (host !== undefined) {
                    hosts.add(host);
                }
            }
        }
        for (const host of hosts) {
            if (run.promptedHosts.has(host) || (await this.tokens.getToken(host)) !== undefined) {
                continue;
            }
            run.promptedHosts.add(host);
            const reason = `${host} hosts a private template source. Enter a personal access token to fetch it.`;
            const token = await this.tokenPrompt.promptForToken(host, reason);
            if (token !== undefined) {
                await this.tokens.setToken(host, token);
            }
        }
    }

    /** The reason string shown in the token prompt, tailored to the failure. */
    private promptReason(hadToken: boolean, error: RepositoryAccessError): string {
        if (error.rateLimited && !hadToken) {
            return `Hit ${error.host}'s rate limit for ${error.resource}. A personal access token raises the limit.`;
        }
        if (hadToken) {
            return `The stored token for ${error.host} was rejected (HTTP ${error.status}) for ${error.resource}. Enter a new token.`;
        }
        return `${error.host} denied access to ${error.resource} (HTTP ${error.status}); it may be private. Enter a personal access token.`;
    }

    /** The user-facing failure when no working token could be obtained. */
    private accessFailure(error: RepositoryAccessError, hadToken: boolean): Error {
        if (error.rateLimited) {
            return new Error(
                `${error.host} rate limit exceeded for ${error.resource} — try again later or provide a personal access token.`,
            );
        }
        if (hadToken) {
            return new Error(
                `The token for ${error.host} can't access ${error.resource} (HTTP ${error.status}).`,
            );
        }
        return new Error(
            `${error.resource} on ${error.host} requires a personal access token (none provided).`,
        );
    }

    /** Places `token` onto a remote (github/gitlab) config; local configs never carry one. */
    private withToken(
        config: RepositorySourceConfig,
        token: string | undefined,
    ): RepositorySourceConfig {
        return config.kind === "local" ? config : { ...config, token };
    }

    /**
     * Projects a `sources[]` entry into the provider-specific config to fetch it
     * with. A relative source resolves against the marketplace's `registration`
     * location; a github/local source names its own coordinates and ignores it
     * (so `registration` may be omitted when only the host is needed).
     */
    private configForSource(
        registration: MarketplaceRegistration | undefined,
        source: TemplateSource,
    ): RepositorySourceConfig {
        if (source.kind === "relative") {
            // A relative source only exists against a registration; the callers
            // that pass `undefined` never hand in a relative source.
            return this.configFor(registration!.location, source.path);
        }
        if (source.kind === "github") {
            return {
                kind: "github",
                owner: source.owner,
                repo: source.repo,
                ref: source.ref,
                path: source.path,
                baseUrl: source.baseUrl,
            };
        }
        if (source.kind === "gitlab") {
            return {
                kind: "gitlab",
                projectPath: source.projectPath,
                ref: source.ref,
                path: source.path,
                baseUrl: source.baseUrl,
            };
        }
        // A `provider: "local"` source names its own directory: expand `~`, then
        // scan the whole folder (empty subtree).
        return { kind: "local", rootDir: this.expandHome(source.path), path: "" };
    }

    /**
     * Expands a leading `~` against the injected home directory. The trailing
     * join uses `/` (never `node:path`) to keep the core host-agnostic; the
     * adapter normalises separators when it reads the directory.
     */
    private expandHome(path: string): string {
        if (path === "~") {
            return this.homeDir;
        }
        if (path.startsWith("~/") || path.startsWith("~\\")) {
            return `${this.homeDir}/${path.slice(2)}`;
        }
        return path;
    }

    /**
     * Projects a marketplace location plus a subtree `path` into the
     * provider-specific {@link RepositorySourceConfig} the factory dispatches on.
     * This is the single place the github/local discriminant is mapped, so the
     * fetch flow above stays provider-agnostic.
     */
    private configFor(location: MarketplaceLocation, path: string): RepositorySourceConfig {
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
        if (location.kind === "gitlab") {
            return {
                kind: "gitlab",
                projectPath: location.projectPath,
                ref: location.ref,
                path,
                baseUrl: location.baseUrl,
            };
        }
        return { kind: "local", rootDir: location.rootDir, path };
    }
}
