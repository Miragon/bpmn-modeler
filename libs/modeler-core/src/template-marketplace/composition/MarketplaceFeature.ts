import { HttpClient } from "../../kernel/port/HttpClient";
import { FetchHttpClient } from "../../kernel/adapter/out/FetchHttpClient";
import { NotifierPort, SettingsPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { RepositorySource, TokenPromptPort, TokenStorePort } from "../port/marketplacePorts";
import { RepositorySourceConfig } from "../domain/repositorySourceConfig";
import { GitHubSource } from "../adapter/out/GitHubSource";
import { GitLabSource } from "../adapter/out/GitLabSource";
import { LocalFileSource } from "../adapter/out/LocalFileSource";
import { MarketplaceCache } from "../service/MarketplaceCache";
import { TemplateMarketplaceService } from "../service/TemplateMarketplaceService";

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
