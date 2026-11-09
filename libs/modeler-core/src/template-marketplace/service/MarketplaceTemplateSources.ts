import { TemplateSourceRef } from "../../kernel/domain/templatePreferences";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { registeredTemplateSources } from "../domain/marketplaceSources";
import { MarketplaceRegistrationsPort } from "../port/marketplacePorts";
import { TemplateMarketplaceService } from "./TemplateMarketplaceService";

/** One group of cached template files, with where the user's switches for it live. */
export interface CachedTemplateSource {
    readonly source?: TemplateSourceRef;
    readonly paths: readonly string[];
}

/**
 * The cached marketplace templates the editors load, grouped by registered
 * marketplace so the user's switches can hide one. Without registrations, as
 * on a host that keeps no switches, they come as one group without switches.
 */
export class MarketplaceTemplateSources {
    constructor(
        private readonly cache: Pick<
            TemplateMarketplaceService,
            "cachedTemplatePathsByRegistration" | "getCachedTemplatePaths"
        >,
        private readonly logger: LoggerPort,
        private readonly registrations?: Pick<MarketplaceRegistrationsPort, "read">,
    ) {}

    async getCachedTemplateSources(): Promise<readonly CachedTemplateSource[]> {
        const registered = await this.registered();
        if (registered === undefined) {
            return [{ paths: await this.cache.getCachedTemplatePaths() }];
        }
        return registeredTemplateSources(
            registered,
            await this.cache.cachedTemplatePathsByRegistration(),
        );
    }

    private async registered() {
        if (this.registrations === undefined) return undefined;
        try {
            return (await this.registrations.read()).registered;
        } catch (error) {
            // Served without switches rather than not at all.
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
            return undefined;
        }
    }
}
