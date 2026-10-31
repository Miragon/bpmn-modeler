import { NotifierPort, SettingsPort } from "../../kernel/domain/hostPorts";
import { FetchReport, SourceFailure } from "../domain/fetchReport";
import {
    InvalidMarketplaceError,
    MarketplaceRegistration,
    MarketplaceUpdateFailure,
    MarketplaceUpdateOutcome,
    parseMarketplace,
    parseMarketplaceUrl,
    TemplateSource,
} from "../domain/marketplace";
import { CachePrune, MarketplaceRegistry } from "../domain/marketplaceRegistry";
import {
    RepositorySourceConfig,
    RepositorySourceFactory,
    TokenPromptPort,
    TokenStorePort,
} from "../domain/ports";
import {
    declaredPrivateHosts,
    describeSourceConfig,
    manifestConfig,
    sourceConfig,
    sourceIdentity,
} from "../domain/sourceConfig";
import { includedFiles } from "../domain/sourceInclude";
import {
    FetchedTemplateFile,
    planSourceCacheRefresh,
    SourceFetchOutcome,
    SourceSlotAction,
} from "../domain/sourceCacheRefresh";
import { HostTokenSession } from "./HostTokenSession";
import { MarketplaceCache } from "./MarketplaceCache";

// The pointer file every registered marketplace repo must hold at its root.
const MARKETPLACE_MANIFEST = "marketplace.json";

/**
 * Orchestrates the marketplace lifecycle: resolve a registration's
 * `marketplace.json`, fan out over its sources, fetch every template, and cache
 * it for the render pipeline.
 *
 * Resilience is split by intent. An explicit *add* throws on a missing/malformed
 * `marketplace.json` so the controller skips persisting the registration; a
 * background *update* swallows and logs every error so one bad marketplace never
 * blocks the others. Per-source failures never throw: a failing source keeps
 * the last-good cache, warns and lands in the {@link FetchReport}, leaving
 * siblings intact.
 *
 * Private repos are reached with per-host personal access tokens through one
 * {@link HostTokenSession} per user-initiated command. The token never reaches
 * settings or the cache.
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

    /** A fresh {@link HostTokenSession} — one per user-initiated command. */
    private newTokenSession(): HostTokenSession {
        return new HostTokenSession(this.tokens, this.tokenPrompt, this.notifier);
    }

    /**
     * Registers and fetches a single marketplace from a pasted URL. Self-hosted
     * `baseUrl` marketplaces are object entries in settings and never flow
     * through this string path.
     *
     * @throws {InvalidMarketplaceError} if the URL is unsupported or its
     *   `marketplace.json` is missing/malformed — the caller must not persist a
     *   registration that cannot be fetched.
     * @returns what the fetch of its sources brought in, even when nothing.
     */
    async addMarketplace(url: string): Promise<FetchReport> {
        // Parse up front so the log names the resolved registration, not the raw
        // paste, and a bad URL fails before any log line implies work started.
        const registration = parseMarketplaceUrl(url);
        this.notifier.logInfo(`Adding marketplace: ${registration.url}`);
        const report = await this.fetchAndCache(registration, this.newTokenSession());
        this.notifier.logInfo(
            `Marketplace added: ${registration.url} (${report.cached} template file(s) cached)`,
        );
        return report;
    }

    /**
     * Re-fetches every registered marketplace on demand. Never throws — a
     * failing marketplace is logged and skipped so the others still refresh.
     * One {@link HostTokenSession} spans all marketplaces so the token prompt
     * appears at most once per host across the whole update.
     *
     * The {@link MarketplaceUpdateOutcome} lets the host report a single summary;
     * the `logWarning` above stays the detailed per-marketplace record. A
     * marketplace fails when its manifest cannot be read or none of its sources
     * could be fetched; a partial fetch keeps the failed sources' last-good data
     * and counts as succeeded.
     *
     * After the fetch loop the cache is pruned as
     * {@link MarketplaceRegistry.cachePrune} decides, so removing an entry from
     * settings also removes its orphaned templates.
     */
    async updateAll(): Promise<MarketplaceUpdateOutcome> {
        const tokenSession = this.newTokenSession();
        const registry = MarketplaceRegistry.fromEntries(this.settings.getMarketplaces());
        const { entries } = registry;
        this.notifier.logInfo(`Updating ${entries.length} marketplace(s)`);
        let succeeded = 0;
        const failures: MarketplaceUpdateFailure[] = [];
        for (const entry of entries) {
            this.notifier.logInfo(`Updating marketplace: ${entry.label}`);
            if (entry.kind === "unparseable") {
                failures.push(this.recordSkip(entry.label, entry.reason));
                continue;
            }
            try {
                const report = await this.fetchAndCache(entry.registration, tokenSession);
                if (report.verdict() === "nothingFetched") {
                    failures.push(
                        this.recordSkip(
                            entry.label,
                            `none of its sources could be fetched (${report.reasons().join("; ")})`,
                        ),
                    );
                    continue;
                }
                succeeded++;
                this.notifier.logDebug(
                    `Marketplace updated: ${entry.label} (${report.cached} template file(s) cached)`,
                );
            } catch (error) {
                failures.push(this.recordSkip(entry.label, (error as Error).message));
            }
        }
        await this.pruneCache(registry.cachePrune());
        this.notifier.logInfo(
            `Marketplace update finished: ${succeeded} of ${entries.length} succeeded`,
        );
        return { succeeded, failures };
    }

    /**
     * Prunes cache slots for marketplaces no longer in settings, **without**
     * re-fetching the survivors — the local counterpart to the network-driven
     * prune at the tail of {@link updateAll}. The Remove Marketplace command
     * calls this after deleting entries so the orphaned templates disappear at
     * once, sparing the user a full re-fetch of every remaining marketplace.
     *
     * Reads the post-removal settings and prunes as
     * {@link MarketplaceRegistry.cachePrune} decides, like `updateAll`.
     */
    async pruneOrphanedCaches(): Promise<void> {
        await this.pruneCache(
            MarketplaceRegistry.fromEntries(this.settings.getMarketplaces()).cachePrune(),
        );
    }

    /** Logs a per-marketplace skip warning and returns its {@link MarketplaceUpdateFailure}. */
    private recordSkip(label: string, reason: string): MarketplaceUpdateFailure {
        this.notifier.logWarning(`Skipped template marketplace "${label}": ${reason}`);
        return { label, reason };
    }

    private async pruneCache(prune: CachePrune): Promise<void> {
        if (prune.kind === "suppressed") {
            this.notifier.logDebug(
                `Skipped marketplace cache prune: an unparseable entry left its id unknown (${prune.unparseable.join("; ")})`,
            );
            return;
        }
        const pruned = await this.cache.prune(prune.ids);
        if (pruned.length > 0) {
            this.notifier.logInfo(
                `Pruned ${pruned.length} orphaned marketplace cache(s): ${pruned.join(", ")}`,
            );
        }
    }

    /** The merge input handed to `BpmnElementTemplatesService`. */
    getCachedTemplatePaths(): Promise<string[]> {
        return this.cache.getCachedTemplatePaths();
    }

    /**
     * Manifest-level failures propagate (the marketplace is unusable) and leave
     * the cache untouched; source-level failures are logged, keep that source's
     * last-good slot and are reported. Every source is fetched before any slot
     * changes. Declared-private sources are batch-prompted up front so their
     * tokens are stored before the per-source fetches begin.
     */
    private async fetchAndCache(
        registration: MarketplaceRegistration,
        tokenSession: HostTokenSession,
    ): Promise<FetchReport> {
        const { sources, skipped } = parseMarketplace(
            JSON.parse(await this.readManifest(registration, tokenSession)),
        );
        const skippedNote = skipped.length > 0 ? `, ${skipped.length} skipped` : "";
        this.notifier.logDebug(
            `Manifest of "${registration.url}": ${sources.length} usable source(s)${skippedNote}`,
        );
        // A source this version can't serve (an unknown content type) is loud,
        // not silent: warn per skip so a newer marketplace's extra content is
        // visible rather than mysteriously absent.
        for (const reason of skipped) {
            this.notifier.logWarning(`Skipped a source of "${registration.url}": ${reason}`);
        }
        await tokenSession.ensureTokensForPrivateHosts(declaredPrivateHosts(sources));

        const outcomes: SourceFetchOutcome[] = [];
        const sourceFailures: SourceFailure[] = [];
        for (let index = 0; index < sources.length; index++) {
            const source = sourceIdentity(
                sourceConfig(sources[index], registration.location, this.homeDir),
            );
            try {
                const files = await this.fetchSourceFiles(
                    registration,
                    sources[index],
                    index,
                    tokenSession,
                );
                outcomes.push({ kind: "fetched", sourceIndex: index, source, files });
            } catch (error) {
                this.warnSkippedSource(registration, error);
                outcomes.push({ kind: "failed", sourceIndex: index, source });
                sourceFailures.push(this.sourceFailure(registration, sources[index], error));
            }
        }
        const actions = planSourceCacheRefresh(
            (await this.cache.sourceIndexes(registration.id)).map((sourceIndex) => ({
                sourceIndex,
                source: undefined,
            })),
            outcomes,
        );
        let cached = 0;
        for (const action of actions) {
            try {
                cached += await this.applySlotAction(registration, action);
            } catch (error) {
                this.warnSkippedSource(registration, error);
                // A rejected replace keeps the source's last-good files, so it
                // brought nothing in; a failed removal concerns no listed source.
                if (action.kind === "replace") {
                    sourceFailures.push(
                        this.sourceFailure(registration, sources[action.sourceIndex], error),
                    );
                }
            }
        }
        return FetchReport.of({
            usableSources: sources.length,
            cached,
            sourceFailures,
            skippedTypes: skipped,
        });
    }

    /** @returns the number of template files the action cached. */
    private async applySlotAction(
        registration: MarketplaceRegistration,
        action: SourceSlotAction,
    ): Promise<number> {
        const slot = `${registration.id}/${action.sourceIndex}`;
        switch (action.kind) {
            case "replace":
                await this.cache.replaceSource(registration.id, action.sourceIndex, action.files);
                for (const { repoPath, contentType } of action.files) {
                    this.notifier.logDebug(`Cached template: ${repoPath} → ${slot}/${contentType}`);
                }
                return action.files.length;
            case "remove":
                await this.cache.removeSource(registration.id, action.sourceIndex);
                this.notifier.logDebug(`Removed cached source no longer listed: ${slot}`);
                return 0;
            case "keep":
                return 0;
        }
    }

    private sourceFailure(
        registration: MarketplaceRegistration,
        source: TemplateSource,
        error: unknown,
    ): SourceFailure {
        return {
            source: describeSourceConfig(sourceConfig(source, registration.location, this.homeDir)),
            reason: (error as Error).message,
        };
    }

    private warnSkippedSource(registration: MarketplaceRegistration, error: unknown): void {
        this.notifier.logWarning(
            `Skipped a source of "${registration.url}": ${(error as Error).message}`,
        );
    }

    /**
     * Maps a fetch failure to {@link InvalidMarketplaceError} so the caller's
     * error path is uniform. Goes through {@link HostTokenSession.run} so a
     * private marketplace prompts here — the token then also covers its relative
     * sources.
     */
    private async readManifest(
        registration: MarketplaceRegistration,
        tokenSession: HostTokenSession,
    ): Promise<string> {
        const baseConfig = manifestConfig(registration.location);
        this.notifier.logDebug(
            `Fetching ${MARKETPLACE_MANIFEST} from ${describeSourceConfig(baseConfig)}`,
        );
        try {
            return await tokenSession.run(baseConfig, (config) =>
                this.sourceFactory(config).fetchFile(MARKETPLACE_MANIFEST),
            );
        } catch (error) {
            // `ErrorOptions` is not in this lib target, so the cause is attached directly.
            throw Object.assign(
                new InvalidMarketplaceError(
                    `could not read ${MARKETPLACE_MANIFEST} from "${registration.url}": ${(error as Error).message}`,
                ),
                { cause: error },
            );
        }
    }

    /**
     * The whole listing+fetch runs under {@link HostTokenSession.run}, so a
     * mid-source auth failure prompts and retries.
     */
    private async fetchSourceFiles(
        registration: MarketplaceRegistration,
        source: TemplateSource,
        index: number,
        tokenSession: HostTokenSession,
    ): Promise<FetchedTemplateFile[]> {
        const baseConfig = sourceConfig(source, registration.location, this.homeDir);
        this.notifier.logDebug(
            `Fetching source ${index} of "${registration.url}": ${describeSourceConfig(baseConfig)}`,
        );
        return tokenSession.run(baseConfig, async (config) => {
            const repository = this.sourceFactory(config);
            const listed = await repository.listTemplateFiles();
            this.notifier.logDebug(
                `Source ${index} of "${registration.url}": ${listed.length} template file(s) listed`,
            );
            const files = includedFiles(listed, config.path, source.include);
            if (files.length !== listed.length) {
                this.notifier.logDebug(
                    `Source ${index}: "include" kept ${files.length} of ${listed.length} listed file(s)`,
                );
            }
            if (files.length === 0) {
                this.warnNoFilesToCache(registration, config, index, source.include, listed.length);
            }
            const fetched: FetchedTemplateFile[] = [];
            for (const repoPath of files) {
                const content = await repository.fetchFile(repoPath);
                fetched.push({ contentType: source.type, repoPath, content });
            }
            return fetched;
        });
    }

    /**
     * Distinguishes the two ways a source ends up with nothing to cache. Files
     * listed but filtered to zero by `include` almost always means a mistyped
     * pattern (not an empty subtree), so it warrants a distinct warning naming
     * the config; a genuinely empty listing keeps the original hint. Warn (never
     * throw) is consistent with D8's per-source resilience.
     */
    private warnNoFilesToCache(
        registration: MarketplaceRegistration,
        config: RepositorySourceConfig,
        index: number,
        include: readonly string[] | undefined,
        listedCount: number,
    ): void {
        if (include !== undefined && listedCount > 0) {
            this.notifier.logWarning(
                `Source ${index} of "${registration.url}": "include" patterns matched none of ` +
                    `${listedCount} listed file(s) (${describeSourceConfig(config)}) — check the patterns`,
            );
            return;
        }
        // A local source with zero files most often means a mistyped folder; the
        // hint closes that otherwise-silent gap. A remote subtree returning zero
        // is a genuine empty subtree worth flagging.
        const hint =
            config.kind === "local" ? " — the folder may not exist or holds no .json files" : "";
        this.notifier.logWarning(
            `Source ${index} of "${registration.url}" has no template files (${describeSourceConfig(config)})${hint}`,
        );
    }
}
