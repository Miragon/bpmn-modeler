import { CachedTemplateSource } from "../../kernel/domain/marketplaceListing";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { registeredTemplateSources } from "../domain/marketplaceSources";
import { MarketplaceRegistrationsPort } from "../port/marketplacePorts";
import { TemplateMarketplaceService } from "./TemplateMarketplaceService";

/**
 * The cached marketplace templates the editors load, grouped by registered
 * marketplace so the user's switches can hide one.
 */
export class MarketplaceTemplateSources {
    constructor(
        private readonly cache: Pick<
            TemplateMarketplaceService,
            "cachedTemplatePathsByRegistration" | "getCachedTemplatePaths"
        >,
        private readonly logger: LoggerPort,
        private readonly registrations: Pick<MarketplaceRegistrationsPort, "read">,
    ) {}

    async getCachedTemplateSources(): Promise<readonly CachedTemplateSource[]> {
        const byRegistration = await this.cache.cachedTemplatePathsByRegistration();
        // Saves an IntelliJ bridge a host round trip in every project with no marketplace.
        if (byRegistration.size === 0) return [];
        const registered = await this.registered();
        if (registered === undefined) {
            return [{ paths: await this.cache.getCachedTemplatePaths() }];
        }
        return registeredTemplateSources(registered, byRegistration);
    }

    private async registered() {
        try {
            return (await this.registrations.read()).registered;
        } catch (error) {
            // Served without switches rather than not at all.
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
            return undefined;
        }
    }
}
