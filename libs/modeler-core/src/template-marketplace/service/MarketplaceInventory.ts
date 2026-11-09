import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { LoggerPort } from "../../kernel/port/hostPorts";
import {
    CachedTemplates,
    MarketplaceSource,
    marketplaceSourcesOf,
} from "../domain/marketplaceSources";
import { MarketplaceRegistrationsPort } from "../port/marketplacePorts";
import { MarketplaceCommands } from "./MarketplaceCommands";
import { TemplateMarketplaceService } from "./TemplateMarketplaceService";

/**
 * The registered marketplaces as the add-on catalog lists them, with the
 * templates cached for each, and the flows of the marketplace commands,
 * which ask, queue and report on their own.
 */
export class MarketplaceInventory {
    constructor(
        private readonly registrations: MarketplaceRegistrationsPort,
        private readonly cache: Pick<
            TemplateMarketplaceService,
            "cachedTemplatePathsByRegistration"
        >,
        private readonly commands: Pick<
            MarketplaceCommands,
            "add" | "update" | "remove" | "onDidChange"
        >,
        private readonly logger: LoggerPort,
    ) {}

    async listMarketplaces(): Promise<readonly MarketplaceSource[]> {
        const { registered } = await this.registrations.read();
        return marketplaceSourcesOf(registered, await this.cachedTemplates());
    }

    add(): Promise<void> {
        return this.commands.add();
    }

    update(): Promise<void> {
        return this.commands.update();
    }

    remove(entry: MarketplaceSettingsEntry): Promise<void> {
        return this.commands.remove(entry);
    }

    onDidChange(listener: () => void): { dispose(): void } {
        return this.commands.onDidChange(listener);
    }

    private async cachedTemplates(): Promise<CachedTemplates> {
        try {
            return {
                kind: "read",
                byRegistration: await this.cache.cachedTemplatePathsByRegistration(),
            };
        } catch (error) {
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
            return { kind: "failed" };
        }
    }
}
