import {
    BpmnLintConfigLocator,
    BpmnLintConfigService,
    BpmnlintParticipant,
    EditorSessionParticipant,
    getBpmnlintConfigHandler,
    NodeBpmnLinter,
    NoopDiagnostics,
    updateLintResultsHandler,
} from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";

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
 * Workspace/Settings/Document/StatusBar ports the bridge already implements.
 * There is no Problems-panel equivalent here, so {@link NoopDiagnostics} stands in.
 *
 * Webview messages: GetBpmnlintConfigCommand, UpdateLintResultsCommand.
 * Session: the core {@link BpmnlintParticipant}, the same one VS Code runs.
 */
export function register(deps: BridgeSharedDeps): { participants: EditorSessionParticipant[] } {
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

    // A missing/malformed config degrades to linting-off inside the service, and
    // a stale in-page push after a host takeover is ignored there.
    deps.router
        .on("GetBpmnlintConfigCommand", getBpmnlintConfigHandler(lintSvc))
        .on("UpdateLintResultsCommand", updateLintResultsHandler(lintSvc));

    return {
        participants: [new BpmnlintParticipant(lintSvc, locator, deps.statusBar, deps.notifier)],
    };
}
