import {
    BpmnElementTemplatesService,
    createMarketplaceCommands,
    createTemplateMarketplaceService,
    MarketplaceInventory,
    MarketplaceTemplateSources,
    TemplateMarketplaceService,
} from "@miragon/bpmn-modeler-core";

import { RpcMarketplacePrompt } from "../templateMarketplace/adapter/out/RpcMarketplacePrompt";
import { RpcMarketplaceRegistrations } from "../templateMarketplace/adapter/out/RpcMarketplaceRegistrations";
import { RpcTokenPrompt } from "../templateMarketplace/adapter/out/RpcTokenPrompt";
import { RpcTokenStore } from "../templateMarketplace/adapter/out/RpcTokenStore";
import { marketplaceHandlers } from "../templateMarketplace/adapter/in/marketplaceHandlers";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * Options the entrypoint threads in that the host-agnostic core cannot read
 * itself: where the on-disk cache lives, and the home directory used to expand a
 * `~` in a pasted local path.
 *
 * **Cache is per-project**, not machine-global: the IntelliJ host derives
 * {@link cacheRoot} from a `PathManager.getSystemPath()` root segmented by the
 * project's stable location hash, so a prune only ever evicts the current
 * project's slots (marketplaces can be project-scoped). Windows on the *same*
 * project still share one cache, with no cross-window locking: a slot's record
 * names its files only once they are complete, but {@link MarketplaceCache}
 * orders the writes of one process only, so two windows updating one slot at
 * once can leave it incomplete until the next update.
 */
export interface MarketplaceOptions {
    /** Absolute cache root; {@link MarketplaceCache} mkdirps it on first write. */
    cacheRoot: string;
    /** Injected home dir so `~` in a pasted path / local source resolves host-side. */
    homeDir: string;
}

/**
 * The template-marketplace feature: builds the host-agnostic
 * {@link TemplateMarketplaceService} over the two RPC-backed token ports and, in
 * a second phase, maps the `marketplace/*` notifications onto the core
 * {@link MarketplaceCommands}, which ask IntelliJ and keep its stores over RPC.
 *
 * Split into two phases to break the same construction cycle the VS Code host
 * has: the service must exist before the templates feature (which merges its
 * cache into element-template discovery), but the flows need that same
 * templates service to refresh open editors after a fetch. So
 * {@link register} builds the service and {@link registerHandlers} runs last.
 */
export function register(
    deps: BridgeSharedDeps,
    options: MarketplaceOptions,
): {
    marketplaceSvc: TemplateMarketplaceService;
    templateSources: MarketplaceTemplateSources;
    registrations: RpcMarketplaceRegistrations;
} {
    const marketplaceSvc = createTemplateMarketplaceService({
        workspace: deps.nodeWorkspace,
        settings: deps.settings,
        notifier: deps.notifier,
        tokens: new RpcTokenStore(deps.rpc),
        tokenPrompt: new RpcTokenPrompt(deps.rpc),
        cacheRoot: options.cacheRoot,
        homeDir: options.homeDir,
    });

    const registrations = new RpcMarketplaceRegistrations(deps.rpc);
    return {
        marketplaceSvc,
        templateSources: new MarketplaceTemplateSources(
            marketplaceSvc,
            deps.notifier,
            registrations,
        ),
        registrations,
    };
}

/**
 * Registers the Host→Core marketplace notifications, once the templates
 * service exists. The add-on catalog runs the same commands, so their flows
 * queue together and every view follows them.
 */
export function registerHandlers(
    deps: BridgeSharedDeps,
    handles: {
        marketplaceSvc: TemplateMarketplaceService;
        templatesSvc: BpmnElementTemplatesService;
        registrations: RpcMarketplaceRegistrations;
        homeDir: string;
    },
): { marketplaces: MarketplaceInventory } {
    const { commands, inventory } = createMarketplaceCommands({
        marketplaces: handles.marketplaceSvc,
        templates: handles.templatesSvc,
        registrations: handles.registrations,
        prompt: new RpcMarketplacePrompt(deps.rpc),
        picker: deps.picker,
        notifier: deps.notifier,
        homeDir: handles.homeDir,
    });
    bindHandlers(deps.rpc, marketplaceHandlers({ commands, settingsMirror: deps.settings }));
    return { marketplaces: inventory };
}
