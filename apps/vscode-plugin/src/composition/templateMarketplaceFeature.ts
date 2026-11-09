import { homedir } from "node:os";

import { ExtensionContext } from "vscode";

import {
    BpmnElementTemplatesService,
    createMarketplaceCommands,
    createTemplateMarketplaceService,
    MarketplaceInventory,
    MarketplaceTemplateSources,
    TemplateMarketplaceService,
} from "@miragon/bpmn-modeler-core";
import { getContext } from "../shared/adapter/out/extensionContext";
import {
    reloadForUnregisteredSetting,
    TemplateMarketplaceController,
} from "../templateMarketplace/adapter/in/TemplateMarketplaceController";
import { VsCodeMarketplacePrompt } from "../templateMarketplace/adapter/out/VsCodeMarketplacePrompt";
import { VsCodeMarketplaceRegistrations } from "../templateMarketplace/adapter/out/VsCodeMarketplaceRegistrations";
import { VsCodeTokenPrompt } from "../templateMarketplace/adapter/out/VsCodeTokenPrompt";
import { VsCodeTokenStore } from "../templateMarketplace/adapter/out/VsCodeTokenStore";
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
): { marketplaceSvc: TemplateMarketplaceService; templateSources: MarketplaceTemplateSources } {
    // Per-workspace cache root so a prune only ever evicts *this* window's slots:
    // marketplaces can be workspace-scoped, so an Update/Remove in another window
    // must not delete a marketplace registered only here. `storageUri` is VS
    // Code's stable per-workspace directory; a no-folder window has none, so fall
    // back to the shared global root there. `writeFile` mkdirps it on first use.
    const base = getContext().storageUri ?? getContext().globalStorageUri;
    const marketplaceSvc = createTemplateMarketplaceService({
        workspace: deps.vsWorkspace,
        settings: deps.vsSettings,
        notifier: deps.notifier,
        tokens: new VsCodeTokenStore(),
        tokenPrompt: new VsCodeTokenPrompt(),
        cacheRoot: `${base.fsPath}/marketplaces`,
        homeDir: homedir(),
    });

    const templateSources = new MarketplaceTemplateSources(
        marketplaceSvc,
        deps.notifier,
        new VsCodeMarketplaceRegistrations(deps.vsSettings),
    );

    return { marketplaceSvc, templateSources };
}

/**
 * Deferred until after the editor feature so the commands re-run the same
 * {@link BpmnElementTemplatesService} that consumes the cache, refreshing open
 * editors. The add-on catalog runs the same commands, so their flows queue
 * together and every view follows them.
 */
export function registerCommands(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: {
        marketplaceSvc: TemplateMarketplaceService;
        templatesSvc: BpmnElementTemplatesService;
    },
): { marketplaces: MarketplaceInventory } {
    const { commands, inventory } = createMarketplaceCommands({
        marketplaces: handles.marketplaceSvc,
        templates: handles.templatesSvc,
        registrations: new VsCodeMarketplaceRegistrations(deps.vsSettings),
        prompt: new VsCodeMarketplacePrompt(),
        picker: deps.picker,
        notifier: deps.notifier,
        homeDir: homedir(),
        explainAddFailure: reloadForUnregisteredSetting(deps.notifier),
    });
    new TemplateMarketplaceController(commands).register(context);
    return { marketplaces: inventory };
}
