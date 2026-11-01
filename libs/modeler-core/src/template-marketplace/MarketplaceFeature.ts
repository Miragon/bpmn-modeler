import { join } from "path";

import { HttpClient } from "../kernel/domain/http";
import { FetchHttpClient } from "../kernel/infrastructure/FetchHttpClient";
import { NotifierPort, SettingsPort, WorkspacePort } from "../kernel/domain/hostPorts";
import { FetchReport } from "./domain/fetchReport";
import { expandHomePath } from "./domain/marketplace";
import {
    RepositorySource,
    RepositorySourceConfig,
    TokenPromptPort,
    TokenStorePort,
} from "./domain/ports";
import { GitHubSource } from "./infrastructure/GitHubSource";
import { GitLabSource } from "./infrastructure/GitLabSource";
import { LocalFileSource } from "./infrastructure/LocalFileSource";
import { MarketplaceCache } from "./service/MarketplaceCache";
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
 *
 * The flows run one at a time, a later one waiting under its progress: a prune
 * keeps only the registered marketplaces, so it must not run while an add has
 * cached a marketplace it has not persisted yet, nor while an update works from
 * the registrations it read before a removal.
 */
export class MarketplaceCommands {
    private runs: Promise<unknown> = Promise.resolve();

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
     * Persists the registration only after its `marketplace.json` was read, so a
     * location without one never lands in settings. A valid manifest whose
     * sources all failed is still persisted: a later update may reach them. The
     * location is persisted expanded, so a later update never sees a `~`.
     */
    async add(input: string, persist: (location: string) => Promise<void>): Promise<void> {
        const location = expandHomePath(input.trim(), this.homeDir, join);
        try {
            const report = await this.notifier.withProgress("Adding marketplace…", () =>
                this.oneAtATime(() => this.fetchAndRegister(location, persist)),
            );
            this.reportAdded(report);
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
            this.oneAtATime(async () => {
                const updated = await this.marketplaces.updateAll();
                await this.templates.reloadMarketplaceTemplates();
                return updated;
            }),
        );

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
            await this.oneAtATime(async () => {
                await unregister();
                await this.marketplaces.pruneOrphanedCaches();
                await this.templates.reloadMarketplaceTemplates();
            });
            this.notifier.showInfo(`Removed ${count} marketplace(s).`);
        } catch (error) {
            this.notifier.notifyError("Failed to remove marketplace(s).", error as Error);
        }
    }

    /** The fetch caches before the persist, so a failed add must not leave that cache behind. */
    private async fetchAndRegister(
        location: string,
        persist: (location: string) => Promise<void>,
    ): Promise<FetchReport> {
        try {
            const report = await this.marketplaces.addMarketplace(location);
            await persist(location);
            this.notifier.logDebug(`Marketplace registration persisted: ${location}`);
            await this.templates.reloadMarketplaceTemplates();
            return report;
        } catch (error) {
            await this.marketplaces.pruneOrphanedCaches();
            throw error;
        }
    }

    private reportAdded(report: FetchReport): void {
        const verdict = report.verdict();
        if (verdict === "complete") {
            this.notifier.showInfo("Marketplace added.");
            return;
        }
        const headline =
            verdict === "partial"
                ? "Marketplace added, but some of its sources could not be fetched:"
                : "Marketplace added, but none of its sources could be fetched:";
        this.notifier.showWarning(`${headline}\n${report.reasons().join("\n")}`);
    }

    // Outside the queue: a host's explanation may wait for a click.
    private async reportAddFailure(error: Error): Promise<void> {
        if (await this.explainAddFailure(error)) return;
        this.notifier.notifyError("Failed to add marketplace.", error);
    }

    private oneAtATime<T>(run: () => Promise<T>): Promise<T> {
        const done = this.runs.then(run);
        this.runs = done.catch(() => undefined);
        return done;
    }
}
