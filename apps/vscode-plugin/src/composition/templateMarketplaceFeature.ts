import { homedir } from "node:os";

import { ExtensionContext } from "vscode";

import {
    BpmnElementTemplatesService,
    FetchHttpClient,
    GitHubSource,
    GitLabSource,
    LocalFileSource,
    MarketplaceCache,
    RepositorySource,
    RepositorySourceConfig,
    TemplateMarketplaceService,
} from "@miragon/bpmn-modeler-core";
import { getContext } from "../shared/infrastructure/extensionContext";
import { TemplateMarketplaceController } from "../templateMarketplace/controller/TemplateMarketplaceController";
import { VsCodeTokenPrompt } from "../templateMarketplace/infrastructure/VsCodeTokenPrompt";
import { VsCodeTokenStore } from "../templateMarketplace/infrastructure/VsCodeTokenStore";
import { SharedDeps } from "./sharedDeps";

/**
 * Split into two phases to break a construction cycle: the service must exist
 * before the editor feature (which merges it into the template service), but the
 * commands need that same template service to refresh open editors. So the
 * service is built here and {@link registerCommands} runs after the editor feature.
 */
export function register(
    _context: ExtensionContext,
    deps: SharedDeps,
): { marketplaceSvc: TemplateMarketplaceService } {
    const httpClient = new FetchHttpClient();
    const sourceFactory = (config: RepositorySourceConfig): RepositorySource => {
        switch (config.kind) {
            case "github":
                return new GitHubSource(httpClient, config);
            case "gitlab":
                return new GitLabSource(httpClient, config);
            case "local":
                return new LocalFileSource(deps.vsWorkspace, config);
        }
    };

    // Per-workspace cache root so a prune only ever evicts *this* window's slots:
    // marketplaces can be workspace-scoped, so an Update/Remove in another window
    // must not delete a marketplace registered only here. `storageUri` is VS
    // Code's stable per-workspace directory; a no-folder window has none, so fall
    // back to the shared global root there. `writeFile` mkdirps it on first use.
    const base = getContext().storageUri ?? getContext().globalStorageUri;
    const cache = new MarketplaceCache(`${base.fsPath}/marketplaces`, deps.vsWorkspace);

    const marketplaceSvc = new TemplateMarketplaceService(
        sourceFactory,
        cache,
        deps.vsSettings,
        deps.notifier,
        new VsCodeTokenStore(),
        new VsCodeTokenPrompt(),
        // Injected so the host-agnostic core can expand `~` in a local source.
        homedir(),
    );

    return { marketplaceSvc };
}

/**
 * Deferred until after the editor feature so the commands re-run the same
 * {@link BpmnElementTemplatesService} that consumes the cache, refreshing open editors.
 */
export function registerCommands(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: {
        marketplaceSvc: TemplateMarketplaceService;
        templatesSvc: BpmnElementTemplatesService;
    },
): void {
    new TemplateMarketplaceController(
        handles.marketplaceSvc,
        handles.templatesSvc,
        deps.editorStore,
        deps.vsSettings,
        deps.notifier,
    ).register(context);
}
