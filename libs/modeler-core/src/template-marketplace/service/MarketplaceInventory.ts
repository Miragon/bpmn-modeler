import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { MarketplacesListing } from "../../kernel/domain/marketplaceListing";
import {
    CachedTemplates,
    marketplaceSourcesOf,
    REGISTRATIONS_UNREADABLE,
} from "../domain/marketplaceSources";
import { RegistrationsByScope } from "../domain/marketplaceRegistrations";
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

    async listMarketplaces(): Promise<MarketplacesListing> {
        const registered = await this.registered();
        if (registered === undefined) {
            return REGISTRATIONS_UNREADABLE;
        }
        return {
            kind: "listed",
            sources: marketplaceSourcesOf(registered, await this.cachedTemplates()),
        };
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

    private async registered(): Promise<RegistrationsByScope | undefined> {
        try {
            return (await this.registrations.read()).registered;
        } catch (error) {
            this.logError(error);
            return undefined;
        }
    }

    private async cachedTemplates(): Promise<CachedTemplates> {
        try {
            return {
                kind: "read",
                byRegistration: await this.cache.cachedTemplatePathsByRegistration(),
            };
        } catch (error) {
            this.logError(error);
            return { kind: "failed" };
        }
    }

    private logError(error: unknown): void {
        this.logger.logError(error instanceof Error ? error : new Error(String(error)));
    }
}
