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
 * the single source of truth in `protocol/descriptor.ts` (with `METHODS.*`
 * constants consumed at every call-site), kept honest by `protocol.spec.ts` and
 * the checked-in `protocol/protocol.json` snapshot. `protocolTable()` renders
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

import { WebviewMessageRouter } from "@miragon/bpmn-modeler-core";

import { Rpc } from "./rpc";
import { buildSharedDeps } from "./composition/sharedDeps";
import * as diffFeature from "./composition/diffFeature";
import * as marketplaceFeature from "./composition/marketplaceFeature";
import * as bpmnEditorFeature from "./composition/bpmnEditorFeature";
import * as scriptFeature from "./composition/scriptFeature";
import * as editorSessionFeature from "./composition/editorSessionFeature";
import * as commandsFeature from "./composition/commandsFeature";
import * as deploymentFeature from "./composition/deploymentFeature";

/**
 * Host-supplied paths the core cannot read itself.
 *
 * @property marketplaceCacheRoot Absolute root for the marketplace template
 *   cache. Defaults to `~/.miragon-bpmn-modeler/marketplaces`; the IntelliJ host
 *   overrides it with a `PathManager`-derived, per-project location (segmented by
 *   the project's location hash) via `server.ts`.
 * @property homeDir Home directory used to expand a `~` in a pasted local path.
 */
export interface BridgeOptions {
    marketplaceCacheRoot?: string;
    homeDir?: string;
}

/**
 * Constructs the bridge: the shared collaborators, then every per-feature wiring
 * module. Handles flow forward: diff's `rebroadcastLanguage`, the marketplace
 * cache, the script editor and the deployment status into the BPMN editor, whose
 * router and participants the editor-session feature's lifecycle runs.
 *
 * @param write Emits one framed JSON line (caller appends the newline + flushes).
 * @param log   Diagnostic sink (stderr in production; a spy in tests). Kept off
 *              the RPC `write` so it can never corrupt the stdout frame stream.
 * @returns the live {@link Rpc} peer — feed it inbound lines via `handleLine` —
 *   and the BPMN editor's routes, which the coverage spec reads.
 */
export function createBridge(
    write: (line: string) => void,
    log: (message: string) => void = () => {},
    options: BridgeOptions = {},
): {
    rpc: Rpc;
    editorRoutes: Pick<WebviewMessageRouter, "routeOf">;
    diffPaneRoutes: Pick<WebviewMessageRouter, "routeOf">;
} {
    const deps = buildSharedDeps(write, log);

    const homeDir = options.homeDir ?? homedir();
    const cacheRoot =
        options.marketplaceCacheRoot ?? join(homeDir, ".miragon-bpmn-modeler", "marketplaces");

    const diff = diffFeature.register(deps);
    // The marketplace service must exist before the BPMN editor so its cache merges
    // into element-template discovery; its add/update handlers are registered last
    // (they need the templates service to refresh open editors).
    const marketplace = marketplaceFeature.register(deps, { cacheRoot, homeDir });
    const script = scriptFeature.register(deps);
    const deployment = deploymentFeature.register(deps);
    const editor = bpmnEditorFeature.register(deps, {
        onSettingsApplied: diff.rebroadcastLanguage,
        templateProvider: marketplace.marketplaceSvc,
        scriptEditor: script.editorContribution,
        deploymentStatus: deployment.statusParticipant,
    });
    editorSessionFeature.register(deps, editor);
    // Portable modeler commands (change engine version, layout, migrate all) reuse
    // the editor's services.
    commandsFeature.register(deps, { bpmnService: editor.bpmnService, layout: editor.layout });
    marketplaceFeature.registerHandlers(deps, {
        marketplaceSvc: marketplace.marketplaceSvc,
        templatesSvc: editor.templates,
        homeDir,
    });

    return {
        rpc: deps.rpc,
        editorRoutes: editor.router,
        diffPaneRoutes: new WebviewMessageRouter(),
    };
}
