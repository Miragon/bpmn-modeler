import { NotifierPort, SettingsPort } from "../../shared/domain/hostPorts";
import {
    InvalidMarketplaceError,
    MarketplaceLocation,
    MarketplaceRegistration,
    parseMarketplace,
    parseMarketplaceUrl,
    TemplateSource,
} from "../domain/marketplace";
import { RepositorySourceConfig, RepositorySourceFactory } from "../domain/ports";
import { MarketplaceCache } from "../infrastructure/MarketplaceCache";

// The pointer file every registered marketplace repo must hold at its root.
const MARKETPLACE_MANIFEST = "marketplace.json";

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
 */
export class TemplateMarketplaceService {
    /**
     * @param sourceFactory Builds a provider adapter for a repo/subtree.
     * @param cache Local store the render pipeline reads from.
     * @param settings Reads the persisted list of registered marketplaces.
     * @param notifier User-facing logging for the warn-and-continue path.
     * @param homeDir Absolute home directory, injected because the host-agnostic
     *   core cannot read it; used to expand `~` in a `provider: "local"` source.
     */
    constructor(
        private readonly sourceFactory: RepositorySourceFactory,
        private readonly cache: MarketplaceCache,
        private readonly settings: SettingsPort,
        private readonly notifier: NotifierPort,
        private readonly homeDir: string,
    ) {}

    /**
     * Registers and fetches a single marketplace from a pasted GitHub URL.
     *
     * @throws {InvalidMarketplaceError} if the URL is not a GitHub repo or its
     *   `marketplace.json` is missing/malformed — the caller must not persist a
     *   registration that cannot be fetched.
     */
    async addMarketplace(url: string): Promise<void> {
        await this.fetchAndCache(parseMarketplaceUrl(url));
    }

    /**
     * Re-fetches every registered marketplace on demand (decision D7: no silent
     * auto-refresh). Never throws — a failing marketplace is logged and skipped
     * so the others still refresh and the modeler stays usable offline.
     */
    async updateAll(): Promise<void> {
        for (const url of this.settings.getTemplateMarketplaces()) {
            try {
                await this.fetchAndCache(parseMarketplaceUrl(url));
            } catch (error) {
                this.notifier.logWarning(
                    `Skipped template marketplace "${url}": ${(error as Error).message}`,
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
     */
    private async fetchAndCache(registration: MarketplaceRegistration): Promise<void> {
        const sources = parseMarketplace(JSON.parse(await this.readManifest(registration)));

        for (let index = 0; index < sources.length; index++) {
            try {
                await this.cacheSource(registration, sources[index], index);
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
     */
    private async readManifest(registration: MarketplaceRegistration): Promise<string> {
        const root = this.sourceFactory(this.configFor(registration.location, ""));
        try {
            return await root.fetchFile(MARKETPLACE_MANIFEST);
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
     * carries its own coordinates.
     */
    private async cacheSource(
        registration: MarketplaceRegistration,
        source: TemplateSource,
        index: number,
    ): Promise<void> {
        let config: RepositorySourceConfig;
        if (source.kind === "relative") {
            config = this.configFor(registration.location, source.path);
        } else if (source.kind === "github") {
            config = {
                kind: "github",
                owner: source.owner,
                repo: source.repo,
                ref: source.ref,
                path: source.path,
            };
        } else {
            // A `provider: "local"` source names its own directory: expand `~`,
            // then scan the whole folder (empty subtree).
            config = { kind: "local", rootDir: this.expandHome(source.path), path: "" };
        }

        const repository = this.sourceFactory(config);
        for (const repoPath of await repository.listTemplateFiles()) {
            const content = await repository.fetchFile(repoPath);
            await this.cache.writeTemplate(registration.id, index, repoPath, content);
        }
    }

    /**
     * Projects a marketplace location plus a subtree `path` into the
     * provider-specific {@link RepositorySourceConfig} the factory dispatches on.
     * This is the single place the github/local discriminant is mapped, so the
     * fetch flow above stays provider-agnostic.
     */
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

    private configFor(location: MarketplaceLocation, path: string): RepositorySourceConfig {
        return location.kind === "github"
            ? {
                  kind: "github",
                  owner: location.owner,
                  repo: location.repo,
                  ref: location.ref,
                  path,
              }
            : { kind: "local", rootDir: location.rootDir, path };
    }
}
