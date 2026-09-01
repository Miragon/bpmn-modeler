import { Command, UpdateLintResultsCommand } from "@miragon/bpmn-modeler-shared";
import {
    BpmnLintConfigLocator,
    BpmnLintConfigService,
    NodeBpmnLinter,
    NoopDiagnostics,
} from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";
import { RegisterParams, SessionHooks } from "./sessionHooks";

/**
 * The bpmnlint feature discovers the nearest `.bpmnlintrc` for an open BPMN
 * document and drives the shared three-tier policy in {@link BpmnLintConfigService}:
 * no config → the webview's engine-aware default in-page; a config the bundled
 * resolver covers → the webview lints it in-page against the pushed config; a
 * config it cannot cover → the bridge runs bpmnlint in a full Bun/Node context
 * (so custom `bpmnlint-plugin-*` rules resolve against the workspace exactly like
 * in VS Code) and pushes the findings to the webview, which only renders the
 * in-canvas markers. In-page runs come back via {@link UpdateLintResultsCommand}
 * — the same core behaviour as VS Code, arriving here structurally. It reuses the
 * host-agnostic core stack ({@link BpmnLintConfigLocator} +
 * {@link BpmnLintConfigService} + {@link NodeBpmnLinter}) over the
 * Workspace/Settings/Document/StatusBar ports the bridge already implements — the
 * bridge analogue of the VS Code `BpmnlintParticipant`. There is no Problems-panel
 * equivalent here, so {@link NoopDiagnostics} stands in.
 *
 * Webview messages: GetBpmnlintConfigCommand, UpdateLintResultsCommand.
 * Session hooks: a per-editor `.bpmnlintrc` watcher that re-lints on change.
 */
export function register(deps: BridgeSharedDeps): { sessionHooks: SessionHooks } {
    const locator = new BpmnLintConfigLocator(deps.nodeWorkspace, deps.settings, deps.artifactSvc);
    const lintSvc = new BpmnLintConfigService(
        deps.store,
        deps.documentPort,
        locator,
        new NodeBpmnLinter(),
        new NoopDiagnostics(),
        deps.statusBar,
        deps.notifier,
        deps.settings,
    );

    // The webview posts this once on load (fire-and-forget, not part of the
    // bootstrap handshake). A missing/malformed config degrades to linting-off
    // inside the service, so this never throws into the dispatcher.
    deps.router.on("GetBpmnlintConfigCommand", async (_message: Command, editorId: string) => {
        await lintSvc.setBpmnlintConfig(editorId);
    });

    // The webview posts its own in-page default findings back after each run.
    // The service ignores it once a workspace-config takeover has flipped the
    // editor to the external path.
    deps.router.on("UpdateLintResultsCommand", (message: Command, editorId: string) => {
        const cmd = message as UpdateLintResultsCommand;
        lintSvc.applyWebviewLintResults(editorId, cmd.results, cmd.unresolved, cmd.configToken);
    });

    // Per-editor `.bpmnlintrc` watcher so edits to the rules re-lint the open
    // diagram without reopening it; disposed with the session.
    const watchers = new Map<string, { dispose(): void }[]>();
    const refreshWatcher = async (params: RegisterParams): Promise<void> => {
        watchers.get(params.editorId)?.forEach((disposable) => disposable.dispose());
        watchers.delete(params.editorId);
        const { disposables, errors } = await locator.createWatcher(params.editorId, lintSvc);
        watchers.set(params.editorId, disposables);
        for (const error of errors) deps.notifier.logError(error);
    };

    return {
        sessionHooks: {
            onSessionRegistered: refreshWatcher,
            onSessionReseeded: async (params: RegisterParams) => {
                await refreshWatcher(params);
                await lintSvc.setBpmnlintConfig(params.editorId);
            },
            onSessionDisposed: (editorId: string) => {
                watchers.get(editorId)?.forEach((disposable) => disposable.dispose());
                watchers.delete(editorId);
                // Also frees the service's per-editor mode/cache/negotiation maps
                // (a pre-existing leak — nothing evicted them before) alongside
                // the watcher.
                lintSvc.clearDiagnostics(editorId);
                deps.statusBar.hideBpmnlintStatus();
            },
        },
    };
}
