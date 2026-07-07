import { join } from "node:path";

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

import { RpcTokenPrompt, RpcTokenStore } from "../adapters";
import { METHODS } from "../protocol/descriptor";
import { MarketplaceAddParams, MarketplaceUpdateParams } from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * Options the entrypoint threads in that the host-agnostic core cannot read
 * itself: where the on-disk cache lives, and the home directory used to expand a
 * `~` in a pasted local path.
 *
 * **Cache is shared across project windows** (mirroring VS Code's per-machine
 * global storage): every IntelliJ window points at the same
 * `PathManager.getSystemPath()`-derived root. Concurrent updates worst-case
 * overwrite the same *deterministic* per-file paths (keyed by registration id /
 * source index / repo path), and a torn read is caught by the per-file
 * JSON-parse guard in {@link BpmnElementTemplatesService} — so no cross-window
 * locking is needed.
 */
export interface MarketplaceOptions {
    /** Absolute cache root; {@link MarketplaceCache} mkdirps it on first write. */
    cacheRoot: string;
    /** Injected home dir so `~` in a pasted path / local source resolves host-side. */
    homeDir: string;
}

/**
 * Expands a leading `~` at the host boundary — a shell convention neither the
 * filesystem APIs nor the host-agnostic core resolve — so the core only ever sees
 * an absolute path. `~user` is left untouched (not portably resolvable) so the
 * parser rejects it. Mirrors the VS Code controller's `expandHomePath`, but
 * against the injected `homeDir` rather than `os.homedir()`.
 */
function expandHomePath(input: string, homeDir: string): string {
    if (input === "~") {
        return homeDir;
    }
    if (input.startsWith("~/") || input.startsWith("~\\")) {
        return join(homeDir, input.slice(2));
    }
    return input;
}

/**
 * The template-marketplace feature: builds the host-agnostic
 * {@link TemplateMarketplaceService} (source factory + on-disk cache + the two
 * RPC-backed token ports) and, in a second phase, wires the `marketplace/add` /
 * `marketplace/update` notification handlers.
 *
 * Split into two phases to break the same construction cycle the VS Code host
 * has: the service must exist before the templates feature (which merges its
 * cache into element-template discovery), but the add/update handlers need that
 * same templates service to refresh open editors after a fetch. So
 * {@link register} builds the service and {@link registerHandlers} runs last.
 */
export function register(
    deps: BridgeSharedDeps,
    options: MarketplaceOptions,
): { marketplaceSvc: TemplateMarketplaceService } {
    const httpClient = new FetchHttpClient();
    const sourceFactory = (config: RepositorySourceConfig): RepositorySource => {
        switch (config.kind) {
            case "github":
                return new GitHubSource(httpClient, config);
            case "gitlab":
                return new GitLabSource(httpClient, config);
            case "local":
                return new LocalFileSource(deps.nodeWorkspace, config);
        }
    };

    const cache = new MarketplaceCache(options.cacheRoot, deps.nodeWorkspace);

    const marketplaceSvc = new TemplateMarketplaceService(
        sourceFactory,
        cache,
        deps.settings,
        deps.notifier,
        new RpcTokenStore(deps.rpc),
        new RpcTokenPrompt(deps.rpc),
        options.homeDir,
    );

    return { marketplaceSvc };
}

/**
 * Registers the two Host→Core marketplace notifications. Deferred until after the
 * templates feature so the flows re-run the same
 * {@link BpmnElementTemplatesService} that consumes the cache — refreshing open
 * editors so newly cached templates appear without reopening.
 *
 * RPC (Host → Core): marketplace/add, marketplace/update.
 */
export function registerHandlers(
    deps: BridgeSharedDeps,
    handles: {
        marketplaceSvc: TemplateMarketplaceService;
        templatesSvc: BpmnElementTemplatesService;
        homeDir: string;
    },
): void {
    deps.rpc.on(METHODS.marketplaceAdd, (params: MarketplaceAddParams) => {
        // The action carries the fresh snapshot so a run that fires before any
        // editor opened still sees the configured folder + marketplace list.
        deps.settings.apply(params.settings);
        void addMarketplace(deps, handles, params.location, params.scope);
    });
    deps.rpc.on(METHODS.marketplaceUpdate, (params: MarketplaceUpdateParams) => {
        // Apply *before* updateAll: the service reads the marketplace list from
        // `SettingsPort`, so the snapshot must be live first.
        deps.settings.apply(params.settings);
        void updateMarketplaces(deps, handles);
    });
}

/**
 * Ports the VS Code controller's add flow. The registration is persisted only
 * after the fetch succeeds, so a location whose `marketplace.json` is missing
 * never lands in settings. Unlike VS Code, the persist is an *acknowledged*
 * request whose failure is logged (not thrown) — mirroring `RpcDeploymentState`:
 * the fetch already cached the templates, so a persist error must not swallow the
 * success toast or the editor refresh.
 */
async function addMarketplace(
    deps: BridgeSharedDeps,
    handles: {
        marketplaceSvc: TemplateMarketplaceService;
        templatesSvc: BpmnElementTemplatesService;
        homeDir: string;
    },
    rawLocation: string,
    scope: MarketplaceAddParams["scope"],
): Promise<void> {
    deps.notifier.logInfo("Add Marketplace command invoked");
    // Persist the expanded path so a re-fetch via Update (which re-reads settings)
    // never sees a `~`.
    const location = expandHomePath(rawLocation.trim(), handles.homeDir);
    try {
        await deps.notifier.withProgress("Adding marketplace…", () =>
            handles.marketplaceSvc.addMarketplace(location),
        );
        await persistRegistration(deps, location, scope);
        deps.notifier.logDebug(`Marketplace registration persist requested: ${location}`);
        await refreshOpenEditors(deps, handles.templatesSvc);
        deps.notifier.showInfo("Marketplace added.");
    } catch (error) {
        deps.notifier.notifyError("Failed to add marketplace.", error as Error);
    }
}

/**
 * Ports the VS Code controller's update flow. {@link TemplateMarketplaceService.updateAll}
 * swallows per-marketplace errors itself, so this never blocks even fully offline;
 * its outcome is folded into one summary toast — a success count on the happy
 * path, or an error toast listing each failed marketplace and why.
 */
async function updateMarketplaces(
    deps: BridgeSharedDeps,
    handles: {
        marketplaceSvc: TemplateMarketplaceService;
        templatesSvc: BpmnElementTemplatesService;
    },
): Promise<void> {
    const outcome = await deps.notifier.withProgress("Updating marketplaces…", () =>
        handles.marketplaceSvc.updateAll(),
    );
    await refreshOpenEditors(deps, handles.templatesSvc);

    const total = outcome.succeeded + outcome.failures.length;
    if (total === 0) {
        deps.notifier.showInfo("No marketplaces configured to update.");
        return;
    }
    if (outcome.failures.length === 0) {
        deps.notifier.showInfo(`Updated ${outcome.succeeded} marketplace(s).`);
        return;
    }
    const details = outcome.failures.map((f) => `${f.label}: ${f.reason}`).join("\n");
    deps.notifier.showError(
        `Updated ${outcome.succeeded} of ${total} marketplaces. Failed:\n${details}`,
    );
}

/**
 * Acknowledged persist: the host adds the entry to settings and fans the fresh
 * snapshot to every open bridge. A failure is logged rather than thrown so it
 * never swallows the surrounding success (the templates are already cached).
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

/** Re-pushes templates to every open editor so newly cached ones appear without reopening. */
async function refreshOpenEditors(
    deps: BridgeSharedDeps,
    templatesSvc: BpmnElementTemplatesService,
): Promise<void> {
    for (const editorId of deps.store.getEditorIds()) {
        await templatesSvc.setElementTemplates(editorId);
    }
}
