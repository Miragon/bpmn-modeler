/**
 * Wires the **real**, unmodified BPMN core (`EditorSessionStore` +
 * `BpmnModelerService` + `WebviewMessageRouter`) to the RPC-backed host ports,
 * transport-agnostically: it takes a `write` sink and returns the live
 * {@link Rpc} peer. `server.ts` binds this to stdio; tests bind it to a capture
 * array. Keeping the wiring out of the stdio entrypoint is what makes the
 * register → display → `editor/postMessage` loop unit-testable without spawning
 * a process.
 *
 * The whole point of the out-of-process design: the TypeScript core drives a
 * remote host without being rewritten, so the only per-host maintenance surface
 * is the thin set of port adapters. The host implements the ports as RPC
 * handlers; the core never knows it isn't talking to VS Code.
 *
 * `createBridge` is a pure composition root: it builds the shared collaborators
 * once ({@link buildSharedDeps}) and lets each `composition/*Feature.ts` module
 * wire its own services and register its own slice of the protocol. Each
 * Host→Core method group is implemented by the matching feature module. The
 * BPMN editor's webview commands and session participants are the core
 * `BpmnEditorFeature`'s, so the bridge routes them exactly as VS Code does.
 *
 * The full RPC surface — method names, direction, and param/result shapes — is
 * the single source of truth in `protocol/domain/descriptor.ts`, which gathers
 * the feature-owned `protocol/domain/*Protocol.ts` modules (with `METHODS.*`
 * constants consumed at every call-site), kept honest by `protocol.spec.ts` and
 * the checked-in `protocol/domain/protocol.json` snapshot. `protocolTable()` renders
 * the canonical, un-rottable method index that used to live in this comment.
 *
 * DMN is deliberately out of scope here — it has no IntelliJ editor yet; this
 * covers the BPMN editor, diff, deployment, and the template marketplace. The
 * diff path reuses the production diff brain verbatim (`DiffPaneStore` +
 * `BpmnDiffService` + `bpmn-js-differ`), driven by host-originated `diff/*` RPC
 * instead of VS Code's `vscode.diff` + custom-editor resolution.
 */

import { homedir } from "node:os";
import { join } from "node:path";

import { AddOnsFeature, ListReview, RouteLookup, ViewReview } from "@miragon/bpmn-modeler-core";
import { WebviewSurface } from "@miragon/bpmn-modeler-shared";

import { RpcAddOnViewReveal } from "../addOns/adapter/out/RpcAddOnViewReveal";
import { Rpc } from "../transport/adapter/out/Rpc";
import { buildSharedDeps } from "./sharedDeps";
import * as diffFeature from "./diffFeature";
import * as marketplaceFeature from "./marketplaceFeature";
import * as bpmnEditorFeature from "./bpmnEditorFeature";
import * as bpmnPluginsFeature from "./bpmnPluginsFeature";
import * as scriptFeature from "./scriptFeature";
import * as editorSessionFeature from "./editorSessionFeature";
import * as commandsFeature from "./commandsFeature";
import * as deploymentFeature from "./deploymentFeature";
import * as addOnsFeature from "./addOnsFeature";

/**
 * Host-supplied paths the core cannot read itself.
 *
 * @property marketplaceCacheRoot Absolute root for the marketplace template
 *   cache. Defaults to `~/.miragon-bpmn-modeler/marketplaces`; the IntelliJ host
 *   overrides it with a `PathManager`-derived, per-project location (segmented by
 *   the project's location hash) via `server.ts`.
 * @property pluginCacheRoot Absolute root of the content-addressed cache the
 *   approved workspace plugins are copied to. Defaults to
 *   `~/.miragon-bpmn-modeler/bpmn-plugins`; the IntelliJ host passes a folder of
 *   its system path, shared by every project, which its webview server serves.
 * @property homeDir Home directory used to expand a `~` in a pasted local path.
 */
export interface BridgeOptions {
    marketplaceCacheRoot?: string;
    pluginCacheRoot?: string;
    homeDir?: string;
}

/**
 * Constructs the bridge: the shared collaborators, then every per-feature wiring
 * module. Handles flow forward: diff's `rebroadcastLanguage`, the marketplace
 * cache, the script editor and the deployment status into the BPMN editor, whose
 * router and participants the editor-session feature's lifecycle runs. The
 * add-ons panel and its reveal come last: the plugins' and rule packages'
 * "Review…" opens the add-ons view, so the reveal is built before them and
 * connected to the catalog once it exists.
 *
 * @param write Emits one framed JSON line (caller appends the newline + flushes).
 * @param log   Diagnostic sink (stderr in production; a spy in tests). Kept off
 *              the RPC `write` so it can never corrupt the stdout frame stream.
 * @returns the live {@link Rpc} peer — feed it inbound lines via `handleLine` —
 *   the routes of each webview surface the bridge serves, which the
 *   coverage spec reads, `prunePluginCache` and `migrateContentRows`, which
 *   `server.ts` runs once the streams are bound and which log their own
 *   failure, the add-on catalog a view attaches to, and `dispose`, which
 *   stops the plugin folder watchers, the catalog and the editor's approval
 *   and template subscriptions.
 */
export function createBridge(
    write: (line: string) => void,
    log: (message: string) => void = () => {},
    options: BridgeOptions = {},
): {
    rpc: Rpc;
    surfaceRoutes: Partial<Record<WebviewSurface, RouteLookup>>;
    prunePluginCache(): Promise<void>;
    migrateContentRows(): Promise<void>;
    addOns: AddOnsFeature;
    dispose(): void;
} {
    const deps = buildSharedDeps(write, log);

    const homeDir = options.homeDir ?? homedir();
    const cacheRoot =
        options.marketplaceCacheRoot ?? join(homeDir, ".miragon-bpmn-modeler", "marketplaces");
    const pluginCacheRoot =
        options.pluginCacheRoot ?? join(homeDir, ".miragon-bpmn-modeler", "bpmn-plugins");

    const diff = diffFeature.register(deps);
    // The marketplace service must exist before the BPMN editor so its cache merges
    // into element-template discovery; its add/update handlers are registered last
    // (they need the templates service to refresh open editors).
    const marketplace = marketplaceFeature.register(deps, { cacheRoot, homeDir });
    const script = scriptFeature.register(deps);
    const deployment = deploymentFeature.register(deps);
    // Built before the features whose "Review…" opens the add-ons view, connected once the catalog exists.
    const reveal = new RpcAddOnViewReveal(deps.rpc, deps.log);
    const plugins = bpmnPluginsFeature.register(deps, {
        cacheRoot: pluginCacheRoot,
        review: new ViewReview("plugin", reveal, new ListReview(deps.picker)),
    });
    const editor = bpmnEditorFeature.register(deps, {
        onSettingsApplied: diff.rebroadcastLanguage,
        templateProvider: marketplace.templateSources,
        scriptEditor: script.editorContribution,
        deploymentStatus: deployment.statusParticipant,
        plugins: plugins.editorContribution,
        rulePackageReview: new ViewReview("rulePackage", reveal, new ListReview(deps.picker)),
    });
    editorSessionFeature.register(deps, editor, { pluginCacheRoot });
    // Portable modeler commands (change engine version, layout, generate IDs, migrate
    // all) reuse the editor's services.
    commandsFeature.register(deps, {
        bpmnService: editor.bpmnService,
        layout: editor.layout,
        elementIds: editor.elementIds,
        coreWriteRenderer: editor,
    });
    const { marketplaces } = marketplaceFeature.registerHandlers(deps, {
        marketplaceSvc: marketplace.marketplaceSvc,
        templatesSvc: editor.templates,
        registrations: marketplace.registrations,
        homeDir,
    });
    const addOns = addOnsFeature.register(deps, { editor, plugins, marketplaces });
    reveal.connect(addOns);

    return {
        rpc: deps.rpc,
        surfaceRoutes: {
            bpmnEditor: editor.router,
            bpmnDiffPane: diff.paneRoutes,
            deploymentSidebar: deployment.panelRoutes,
            addOnsView: addOns.panelRoutes,
        },
        prunePluginCache: () => plugins.pruneIdleCopies(),
        migrateContentRows: () => deps.contentRows.run(),
        addOns,
        dispose: () => {
            addOns.dispose();
            editor.dispose();
            plugins.dispose();
        },
    };
}
