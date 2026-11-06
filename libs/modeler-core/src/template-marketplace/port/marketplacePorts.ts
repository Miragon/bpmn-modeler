import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { MarketplaceAddAnswer, MarketplaceAddPrompt } from "../domain/marketplacePrompts";
import { MarketplaceRegistrations, MarketplaceScope } from "../domain/marketplaceRegistrations";
import { RepositorySourceConfig } from "../domain/repositorySourceConfig";
import { TokenPrompt } from "../domain/tokenPrompt";

/**
 * Port abstracting a remote repository that hosts template files.
 *
 * One adapter per provider (`GitHubSource`, `GitLabSource`, `LocalFileSource`)
 * hides the differing tree/raw API shapes behind this seam, so the marketplace
 * service resolves and fetches templates without naming any provider.
 */
export interface RepositorySource {
    /**
     * Paths are returned in the repo's own vocabulary so {@link fetchFile} can
     * round-trip them.
     */
    listTemplateFiles(): Promise<string[]>;

    fetchFile(repoPath: string): Promise<string>;
}

/**
 * Injected into the service so the provider adapters (and their `HttpClient` /
 * `WorkspacePort`) stay in `adapter/out/`.
 */
export type RepositorySourceFactory = (config: RepositorySourceConfig) => RepositorySource;

/**
 * Encrypted-at-rest storage for per-host personal access tokens reaching
 * private template-marketplace repositories.
 *
 * A sibling of the deployment `SecretStorePort` rather than a member: that
 * port is deployment-shaped (basic-auth / OAuth2 pairs) and reshaping it would
 * touch every host. Keyed by `host` for a distinct token per origin; setting an
 * existing host overwrites, which is how token rotation is expressed.
 *
 * `getToken` may be user-visible — IntelliJ's PasswordSafe adapter raises a
 * macOS keychain prompt on read — so callers must read lazily, only after an
 * auth-shaped failure, never speculatively before a request that might succeed
 * anonymously.
 */
export interface TokenStorePort {
    getToken(host: string): Promise<string | undefined>;
    setToken(host: string, token: string): Promise<void>;
}

/**
 * Shows the core's {@link TokenPrompt} as a masked input. Never throws: a
 * dismissal is per-run data, not control flow, so a background `updateAll`
 * keeps going after one.
 *
 * @returns the answer as typed, or `undefined` on dismissal; the core judges a
 * blank one.
 */
export interface TokenPromptPort {
    promptForToken(prompt: TokenPrompt): Promise<string | undefined>;
}

/**
 * Shows the core's {@link MarketplaceAddPrompt}, in one form or in steps as the
 * host lays it out.
 *
 * @returns the answer as entered, or `undefined` on dismissal; the core checks
 * the location and asks again when it refuses it.
 */
export interface MarketplacePromptPort {
    promptForMarketplace(prompt: MarketplaceAddPrompt): Promise<MarketplaceAddAnswer | undefined>;
}

/**
 * The host's own stores of marketplace registrations, one per scope. A write
 * resolves only once `SettingsPort.getMarketplaces` reads the new list, so the
 * prune that follows a removal keeps exactly what is still registered.
 */
export interface MarketplaceRegistrationsPort {
    read(): Promise<MarketplaceRegistrations>;
    register(location: string, scope: MarketplaceScope): Promise<void>;
    /** Removes each entry from every scope that holds it. */
    unregister(entries: readonly MarketplaceSettingsEntry[]): Promise<void>;
}
