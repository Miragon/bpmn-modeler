import { Command } from "@miragon/bpmn-modeler-shared";
import { BpmnLintConfigLocator, BpmnLintConfigService } from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";
import { RegisterParams, SessionHooks } from "./sessionHooks";

/**
 * The bpmnlint feature discovers the nearest `.bpmnlintrc` for an open BPMN
 * document and pushes its raw contents to the webview, which owns the rule
 * allow-list and the in-canvas violation markers. It reuses the host-agnostic
 * core stack unchanged ({@link BpmnLintConfigLocator} + {@link BpmnLintConfigService})
 * over the Workspace/Settings/Document/StatusBar ports the bridge already
 * implements — the bridge analogue of the VS Code `BpmnlintParticipant`.
 *
 * Webview messages: GetBpmnlintConfigCommand.
 * Session hooks: a per-editor `.bpmnlintrc` watcher that re-pushes on change.
 */
export function register(deps: BridgeSharedDeps): { sessionHooks: SessionHooks } {
    const locator = new BpmnLintConfigLocator(deps.nodeWorkspace, deps.settings, deps.artifactSvc);
    const lintSvc = new BpmnLintConfigService(
        deps.store,
        deps.documentPort,
        locator,
        deps.statusBar,
        deps.notifier,
    );

    // The webview posts this once on load (fire-and-forget, not part of the
    // bootstrap handshake). A missing/malformed config degrades to linting-off
    // inside the service, so this never throws into the dispatcher.
    deps.router.on("GetBpmnlintConfigCommand", async (_message: Command, editorId: string) => {
        await lintSvc.setBpmnlintConfig(editorId);
    });

    // Per-editor `.bpmnlintrc` watcher so edits to the rules re-lint the open
    // diagram without reopening it; disposed with the session.
    const watchers = new Map<string, { dispose(): void }[]>();

    return {
        sessionHooks: {
            onSessionRegistered: async (params: RegisterParams) => {
                const { disposables, errors } = await locator.createWatcher(
                    params.editorId,
                    lintSvc,
                );
                watchers.set(params.editorId, disposables);
                for (const error of errors) {
                    deps.notifier.logError(error);
                }
            },
            onSessionDisposed: (editorId: string) => {
                watchers.get(editorId)?.forEach((disposable) => disposable.dispose());
                watchers.delete(editorId);
                deps.statusBar.hideBpmnlintStatus();
            },
        },
    };
}
