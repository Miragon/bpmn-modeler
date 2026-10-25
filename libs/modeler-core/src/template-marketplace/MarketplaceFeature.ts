import { join } from "path";

import { HttpClient } from "../deployment/domain/ports";
import { FetchHttpClient } from "../deployment/infrastructure/FetchHttpClient";
import {
    NotifierPort,
    SettingsPort,
    TokenPromptPort,
    TokenStorePort,
    WorkspacePort,
} from "../shared/domain/hostPorts";
import { expandHomePath } from "./domain/marketplace";
import { RepositorySource, RepositorySourceConfig } from "./domain/ports";
import { GitHubSource } from "./infrastructure/GitHubSource";
import { GitLabSource } from "./infrastructure/GitLabSource";
import { LocalFileSource } from "./infrastructure/LocalFileSource";
import { MarketplaceCache } from "./infrastructure/MarketplaceCache";
import { TemplateMarketplaceService } from "./service/TemplateMarketplaceService";

export interface MarketplaceHostPorts {
    workspace: WorkspacePort;
    settings: SettingsPort;
    notifier: NotifierPort;
    tokens: TokenStorePort;
    tokenPrompt: TokenPromptPort;
    /** Scoped to one workspace/project, so a prune only evicts that one's slots. */
    cacheRoot: string;
    /** Expands `~` in a pasted path or a local source; the core cannot read it. */
    homeDir: string;
    http?: HttpClient;
}

export function createTemplateMarketplaceService(
    ports: MarketplaceHostPorts,
): TemplateMarketplaceService {
    const http = ports.http ?? new FetchHttpClient();
    const sourceFor = (config: RepositorySourceConfig): RepositorySource => {
        switch (config.kind) {
            case "github":
                return new GitHubSource(http, config);
            case "gitlab":
                return new GitLabSource(http, config);
            case "local":
                return new LocalFileSource(ports.workspace, config);
        }
    };
    return new TemplateMarketplaceService(
        sourceFor,
        new MarketplaceCache(ports.cacheRoot, ports.workspace),
        ports.settings,
        ports.notifier,
        ports.tokens,
        ports.tokenPrompt,
        ports.homeDir,
    );
}

export interface MarketplaceTemplates {
    reloadMarketplaceTemplates(): Promise<void>;
}

/**
 * The add, update and remove flows behind the marketplace commands of every
 * host. A host collects the input its own way and persists the registration in
 * its own settings; after each flow the open editors show the changed templates.
 */
export class MarketplaceCommands {
    /**
     * @param explainAddFailure Lets a host replace the generic failure toast with
     *   a host-specific remedy; resolves `true` when it reported the failure.
     */
    constructor(
        private readonly marketplaces: TemplateMarketplaceService,
        private readonly templates: MarketplaceTemplates,
        private readonly notifier: NotifierPort,
        private readonly homeDir: string,
        private readonly explainAddFailure: (error: Error) => Promise<boolean> = async () => false,
    ) {}

    /**
     * Persists the registration only after the fetch succeeds, so a location
     * whose `marketplace.json` is missing never lands in settings. The location
     * is persisted expanded, so a later update never sees a `~`.
     */
    async add(input: string, persist: (location: string) => Promise<void>): Promise<void> {
        const location = expandHomePath(input.trim(), this.homeDir, join);
        try {
            await this.notifier.withProgress("Adding marketplace…", () =>
                this.marketplaces.addMarketplace(location),
            );
            await persist(location);
            this.notifier.logDebug(`Marketplace registration persisted: ${location}`);
            await this.templates.reloadMarketplaceTemplates();
            this.notifier.showInfo("Marketplace added.");
        } catch (error) {
            await this.reportAddFailure(error as Error);
        }
    }

    /**
     * Per-marketplace errors are folded into one summary toast, so an update
     * never blocks, even fully offline.
     */
    async update(): Promise<void> {
        const outcome = await this.notifier.withProgress("Updating marketplaces…", () =>
            this.marketplaces.updateAll(),
        );
        await this.templates.reloadMarketplaceTemplates();

        const total = outcome.succeeded + outcome.failures.length;
        if (total === 0) {
            this.notifier.showInfo("No marketplaces configured to update.");
            return;
        }
        if (outcome.failures.length === 0) {
            this.notifier.showInfo(`Updated ${outcome.succeeded} marketplace(s).`);
            return;
        }
        const details = outcome.failures.map((f) => `${f.label}: ${f.reason}`).join("\n");
        this.notifier.showError(
            `Updated ${outcome.succeeded} of ${total} marketplaces. Failed:\n${details}`,
        );
    }

    /**
     * Prunes only the cache slots the removal orphaned — never re-fetches the
     * survivors. The toast counts the selection, not the pruned slots: a removed
     * entry may have had none, and a malformed remaining entry suppresses pruning.
     */
    async remove(count: number, unregister: () => Promise<void> = async () => {}): Promise<void> {
        try {
            await unregister();
            const pruned = await this.marketplaces.pruneOrphanedCaches();
            this.notifier.logDebug(`Pruned marketplace cache(s): ${pruned.join(", ") || "none"}`);
            await this.templates.reloadMarketplaceTemplates();
            this.notifier.showInfo(`Removed ${count} marketplace(s).`);
        } catch (error) {
            this.notifier.notifyError("Failed to remove marketplace(s).", error as Error);
        }
    }

    /** The fetch caches before the persist, so a failed add must not leave that cache behind. */
    private async reportAddFailure(error: Error): Promise<void> {
        try {
            await this.marketplaces.pruneOrphanedCaches();
        } catch (pruneError) {
            this.notifier.logError(pruneError as Error);
        }
        if (await this.explainAddFailure(error)) return;
        this.notifier.notifyError("Failed to add marketplace.", error);
    }
}
