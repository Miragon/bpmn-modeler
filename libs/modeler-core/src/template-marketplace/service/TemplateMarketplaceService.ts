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
    MarketplaceUpdateFailure,
    MarketplaceUpdateOutcome,
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
 * at most once per run. A decline is recorded too (the host is added regardless
 * of outcome), so the run remembers it and does not nag.
 */
interface PromptRun {
    readonly promptedHosts: Set<string>;
}

/**
 * Orchestrates the marketplace lifecycle: resolve a registration's
 * `marketplace.json`, fan out over its sources, fetch every template, and cache
 * it for the render pipeline.
 *
 * Resilience is split by intent. An explicit *add* throws on a missing/malformed
 * `marketplace.json` so the controller skips persisting the registration; a
 * background *update* swallows and logs every error so one bad marketplace never
 * blocks the others. Per-source failures are always swallowed — a failing source
 * keeps the last-good cache and warns, leaving siblings intact.
 *
 * Private repos are reached with per-host personal access tokens, prompted once
 * per host per run on an auth-shaped {@link RepositoryAccessError} and retried.
 * The token lives only in {@link TokenStorePort} and never reaches settings, the
 * cache, logs, or error messages. {@link hostForConfig} is the single place a
 * config maps to the host its token is keyed by, so github.com, gitlab.com, and
 * self-hosted `baseUrl` origins are handled the same way.
 */
export class TemplateMarketplaceService {
    /**
     * @param tokens Per-host token store; a `setToken` overwrites — that is
     *   token rotation.
     * @param tokenPrompt A decline returns `undefined` and never aborts a run.
     * @param homeDir Injected because the host-agnostic core cannot read it;
     *   used to expand `~` in a `provider: "local"` source.
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
     * Registers and fetches a single marketplace from a pasted URL. Self-hosted
     * `baseUrl` marketplaces are object entries in settings and never flow
     * through this string path.
     *
     * @throws {InvalidMarketplaceError} if the URL is unsupported or its
     *   `marketplace.json` is missing/malformed — the caller must not persist a
     *   registration that cannot be fetched.
     */
    async addMarketplace(url: string): Promise<void> {
        await this.fetchAndCache(parseMarketplaceUrl(url), { promptedHosts: new Set() });
    }

    /**
     * Re-fetches every registered marketplace on demand. Never throws — a
     * failing marketplace is logged and skipped so the others still refresh.
     * One {@link PromptRun} spans all marketplaces so the token prompt appears
     * at most once per host across the whole update.
     *
     * The {@link MarketplaceUpdateOutcome} lets the host report a single summary;
     * the `logWarning` above stays the detailed per-marketplace record. Only
     * manifest-level failures count as a failure — a per-*source* failure inside
     * {@link fetchAndCache} keeps last-good data, so its marketplace still counts
     * as succeeded here.
     */
    async updateAll(): Promise<MarketplaceUpdateOutcome> {
        const run: PromptRun = { promptedHosts: new Set() };
        let succeeded = 0;
        const failures: MarketplaceUpdateFailure[] = [];
        for (const entry of this.settings.getMarketplaces()) {
            // Label first (never throws) so a marketplace whose *entry* fails to
            // parse can still be named in the warning below.
            const label = marketplaceEntryLabel(entry);
            try {
                await this.fetchAndCache(parseMarketplaceEntry(entry), run);
                succeeded++;
            } catch (error) {
                const reason = (error as Error).message;
                this.notifier.logWarning(`Skipped template marketplace "${label}": ${reason}`);
                failures.push({ label, reason });
            }
        }
        return { succeeded, failures };
    }

    /** The merge input handed to {@link BpmnElementTemplatesService}. */
    getCachedTemplatePaths(): Promise<string[]> {
        return this.cache.getCachedTemplatePaths();
    }

    /**
     * Manifest-level failures propagate (the marketplace is unusable);
     * source-level failures are logged and skipped to preserve last-good data.
     * Declared-private sources are batch-prompted up front so their tokens are
     * stored before the per-source fetches begin.
     */
    private async fetchAndCache(
        registration: MarketplaceRegistration,
        run: PromptRun,
    ): Promise<void> {
        const { sources, skipped } = parseMarketplace(
            JSON.parse(await this.readManifest(registration, run)),
        );
        // A source this version can't serve (an unknown content type) is loud,
        // not silent: warn per skip so a newer marketplace's extra content is
        // visible rather than mysteriously absent.
        for (const reason of skipped) {
            this.notifier.logWarning(`Skipped a source of "${registration.url}": ${reason}`);
        }
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
     * Maps a fetch failure to {@link InvalidMarketplaceError} so the caller's
     * error path is uniform. Goes through {@link withAuthRetry} so a private
     * marketplace prompts here — the token then also covers its relative sources.
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
     * The whole listing+fetch runs under {@link withAuthRetry}, so a mid-source
     * auth failure prompts and retries.
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
                await this.cache.write(registration.id, index, source.type, repoPath, content);
            }
        });
    }

    /**
     * Runs `task` with any stored token, then — on an auth-shaped
     * {@link RepositoryAccessError} — prompts once for the host and retries
     * exactly once. A non-auth error or an unauthenticated host (a local folder)
     * propagates unchanged. On decline or a second denial the failure is
     * rewritten via {@link accessFailure}; the raw text would say "HTTP 404" for
     * a private repo.
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
     * Prompts unless this run already prompted the host, adding it regardless of
     * outcome so a decline is remembered. A granted token is stored immediately
     * so later same-host fetches pick it up on their first attempt.
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
     * Prompts up front for every distinct host with a *declared*-private remote
     * source and no stored token, so `withAuthRetry` picks the token up first
     * try. `visibility` is only a hint: undeclared-private sources still get the
     * failure-driven prompt instead.
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

    private promptReason(hadToken: boolean, error: RepositoryAccessError): string {
        if (error.rateLimited && !hadToken) {
            return `Hit ${error.host}'s rate limit for ${error.resource}. A personal access token raises the limit.`;
        }
        if (hadToken) {
            return `The stored token for ${error.host} was rejected (HTTP ${error.status}) for ${error.resource}. Enter a new token.`;
        }
        return `${error.host} denied access to ${error.resource} (HTTP ${error.status}); it may be private. Enter a personal access token.`;
    }

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
     * A relative source resolves against the marketplace's `registration`
     * location; a github/local source names its own coordinates and ignores it,
     * so `registration` may be omitted when only the host is needed.
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
        return { kind: "local", rootDir: this.expandHome(source.path), path: "" };
    }

    /**
     * Expands a leading `~` against the injected home directory. The join uses
     * `/` (never `node:path`) to keep the core host-agnostic; the adapter
     * normalises separators when it reads the directory.
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
     * The single place a location's provider discriminant is mapped, so the
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
