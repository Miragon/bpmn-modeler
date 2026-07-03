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
 * The template-marketplace feature owns its HTTP client, GitHub source factory,
 * and the global-storage-backed cache. It is split into two phases to break a
 * construction cycle: the *service* must exist before the editor feature (which
 * threads it into the template service as the merge source), but the *commands*
 * need that very template service to refresh open editors. So {@link register}
 * builds the service up front and {@link registerCommands} wires the controller
 * once the editor feature has handed back its template service.
 */
export function register(
    _context: ExtensionContext,
    deps: SharedDeps,
): { marketplaceSvc: TemplateMarketplaceService } {
    const httpClient = new FetchHttpClient();
    // Dispatch on the config discriminant: github/gitlab sources fetch over HTTP,
    // a local source reads the workspace filesystem — same port, different adapter.
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

    // Idiomatic machine-global location; `writeFile` mkdirps it on first use.
    const cache = new MarketplaceCache(
        `${getContext().globalStorageUri.fsPath}/marketplaces`,
        deps.vsWorkspace,
    );

    const marketplaceSvc = new TemplateMarketplaceService(
        sourceFactory,
        cache,
        deps.vsSettings,
        deps.notifier,
        // Feature-owned secret storage + prompt for private-repo tokens; the
        // factory stays unchanged (a resolved `config.token` rides through it).
        new VsCodeTokenStore(),
        new VsCodeTokenPrompt(),
        // Injected so the host-agnostic core can expand `~` in a local source.
        homedir(),
    );

    return { marketplaceSvc };
}

/**
 * Registers the marketplace commands. Deferred until after the editor feature so
 * the same {@link BpmnElementTemplatesService} that consumes the cache is the
 * one the commands re-run to refresh open editors.
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
