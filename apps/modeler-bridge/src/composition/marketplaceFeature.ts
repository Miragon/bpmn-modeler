import {
    BpmnElementTemplatesService,
    createTemplateMarketplaceService,
    MarketplaceCommands,
    TemplateMarketplaceService,
} from "@miragon/bpmn-modeler-core";

import { RpcTokenPrompt, RpcTokenStore } from "../adapters";
import { METHODS } from "../protocol/descriptor";
import {
    MarketplaceAddParams,
    MarketplaceRemoveParams,
    MarketplaceUpdateParams,
} from "../protocol/types";
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
 * project still share one cache; concurrent updates worst-case overwrite the same
 * *deterministic* per-file paths (keyed by registration id / source index / repo
 * path), and a torn read is caught by the per-file JSON-parse guard in
 * {@link BpmnElementTemplatesService} — so no cross-window locking is needed.
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
 * {@link MarketplaceCommands} — the flows VS Code runs.
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
): { marketplaceSvc: TemplateMarketplaceService } {
    const marketplaceSvc = createTemplateMarketplaceService({
        workspace: deps.nodeWorkspace,
        settings: deps.settings,
        notifier: deps.notifier,
        tokens: new RpcTokenStore(deps.rpc),
        tokenPrompt: new RpcTokenPrompt(deps.rpc),
        cacheRoot: options.cacheRoot,
        homeDir: options.homeDir,
    });

    return { marketplaceSvc };
}

/**
 * Registers the Host→Core marketplace notifications. Each carries the host's
 * fresh settings snapshot, applied first: the flows read the marketplace list
 * and the config folder from `SettingsPort`, even before any editor opened.
 *
 * RPC (Host → Core): marketplace/add, marketplace/update, marketplace/remove.
 */
export function registerHandlers(
    deps: BridgeSharedDeps,
    handles: {
        marketplaceSvc: TemplateMarketplaceService;
        templatesSvc: BpmnElementTemplatesService;
        homeDir: string;
    },
): void {
    const commands = new MarketplaceCommands(
        handles.marketplaceSvc,
        handles.templatesSvc,
        deps.notifier,
        handles.homeDir,
    );

    deps.rpc.on(METHODS.marketplaceAdd, (params: MarketplaceAddParams) => {
        deps.settings.apply(params.settings);
        deps.notifier.logInfo("Add Marketplace command invoked");
        void commands.add(params.location, (location) =>
            persistRegistration(deps, location, params.scope),
        );
    });
    deps.rpc.on(METHODS.marketplaceUpdate, (params: MarketplaceUpdateParams) => {
        deps.settings.apply(params.settings);
        void commands.update();
    });
    // The host already unregistered the entries; the applied snapshot is the
    // post-removal list the prune reads.
    deps.rpc.on(METHODS.marketplaceRemove, (params: MarketplaceRemoveParams) => {
        deps.settings.apply(params.settings);
        deps.notifier.logInfo("Remove Marketplace command invoked");
        void commands.remove(params.removedCount);
    });
}

/**
 * Acknowledged persist: the host adds the entry to settings and fans the fresh
 * snapshot to every open bridge. A failure is logged rather than thrown, so it
 * never swallows the surrounding success — the templates are already cached.
 *
 * `scope` is echoed straight back from the add — the bridge never interprets it.
 * Persistence has to wait for the fetch to succeed, but only the host knows what
 * "project" vs "application" means, so the choice rides the round trip opaquely.
 */
async function persistRegistration(
    deps: BridgeSharedDeps,
    location: string,
    scope: MarketplaceAddParams["scope"],
): Promise<void> {
    try {
        await deps.rpc.request(METHODS.marketplaceStateSave, { location, scope });
    } catch (error) {
        deps.notifier.logError(
            error instanceof Error
                ? new Error(`Failed to persist marketplace registration: ${error.message}`)
                : new Error("Failed to persist marketplace registration"),
        );
    }
}
