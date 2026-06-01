import { ExtensionContext, window, workspace } from "vscode";

import type { BpmnModelerApi } from "../../modeler-plugin/src/api";
import { activateModeler } from "../../modeler-plugin/src/main";

import { BpmnIqBranchSwitchOrchestrator } from "./infrastructure/BpmnIqBranchSwitchOrchestrator";
import { BpmnIqHttpAdapter } from "./infrastructure/BpmnIqHttpAdapter";
import { BpmnIqMenu } from "./infrastructure/BpmnIqMenu";
import { BpmnIqStatusBar } from "./infrastructure/BpmnIqStatusBar";
import { BpmnIqWorkspaceConfig } from "./infrastructure/BpmnIqWorkspaceConfig";
import { BpmnIqWorkspaceContextResolver } from "./infrastructure/BpmnIqWorkspaceContextResolver";
import { GitDetector } from "./infrastructure/GitDetector";
import { VsCodeSettings } from "./infrastructure/VsCodeSettings";
import { VsCodeUI } from "./infrastructure/VsCodeUI";
import { VsCodeWorkspacePrompts } from "./infrastructure/VsCodeWorkspacePrompts";
import { BpmnIqSyncService } from "./service/BpmnIqSyncService";
import { BpmnIqWorkspacePuller } from "./service/BpmnIqWorkspacePuller";
import { BPMN_IQ_SHOW_MENU_COMMAND, BpmnIqController } from "./controller/BpmnIqController";

/**
 * VS Code activation entry point for the bundled Miragon BPMN-IQ extension.
 *
 * Calls the modeler activation directly to get its public {@link BpmnModelerApi},
 * then wires the cloud-only bpmn-iq sync against the same context.  Because
 * both halves live in this single extension, there is no
 * `vscode.extensions.getExtension(...)` indirection — the API is passed
 * straight into the bpmn-iq wiring.
 */
export function activate(context: ExtensionContext): void {
    const modelerApi = activateModeler(context);
    activateBpmnIq(context, modelerApi);
}

/**
 * Wires the bpmn-iq half of the bundle: infrastructure → service → controller,
 * plus the two streams that keep the daemon's session model in sync with the
 * user's active editor.
 *
 * Cloud-only: the daemon URL comes from {@link VsCodeSettings.getDaemonUrl},
 * which reads only the build-time-baked `MIRAGON_CLOUD_DAEMON_URL` env-var.
 * The controller refuses to start sync (with a clear error) when the URL
 * is empty — no localhost fallback.
 */
function activateBpmnIq(context: ExtensionContext, modelerApi: BpmnModelerApi): void {
    const config = new BpmnIqWorkspaceConfig();
    const settings = new VsCodeSettings();
    const vsUI = new VsCodeUI();
    context.subscriptions.push(vsUI);
    const portFactory = (baseUrl: string, workspaceId: string) =>
        new BpmnIqHttpAdapter(baseUrl, workspaceId);

    const syncService = new BpmnIqSyncService(portFactory, vsUI);
    context.subscriptions.push(syncService);

    const statusBar = new BpmnIqStatusBar(BPMN_IQ_SHOW_MENU_COMMAND, () => settings.getDaemonUrl());
    const menu = new BpmnIqMenu();
    const prompts = new VsCodeWorkspacePrompts();
    const gitDetector = new GitDetector();
    const contextResolver = new BpmnIqWorkspaceContextResolver(config, prompts, gitDetector);
    const branchOrchestrator = new BpmnIqBranchSwitchOrchestrator(
        syncService,
        config,
        settings,
        vsUI,
    );
    const puller = new BpmnIqWorkspacePuller(portFactory, config);

    new BpmnIqController(
        syncService,
        statusBar,
        menu,
        contextResolver,
        branchOrchestrator,
        puller,
        settings,
        vsUI,
    ).register(context);

    // Tab-switch awareness — VS Code-native, no modeler coupling.
    context.subscriptions.push(
        window.onDidChangeActiveTextEditor((editor) => {
            if (!syncService.isRunning || !editor) return;
            if (!editor.document.uri.path.endsWith(".bpmn")) return;
            const modelId = syncService.buildActiveModelId(editor.document.uri.path);
            if (!modelId) return;
            void syncService.setSessionActive({ modelId });
        }),
    );

    // Selection-aware session updates via the modeler API, received directly
    // from activateModeler() above — no extensions.getExtension() round-trip.
    context.subscriptions.push(
        modelerApi.onDidChangeSelection(({ uri, elementId }) => {
            if (!syncService.isRunning) return;
            const modelId = syncService.buildActiveModelId(uri.path);
            if (!modelId) return;
            void syncService.setSessionActive({ modelId, elementId });
        }),
    );

    // If activated outside a workspace folder, log once. Status bar still
    // shows but `start()` will surface the "open a folder first" toast.
    if (!workspace.workspaceFolders?.length) {
        vsUI.logInfo(
            "activated without a workspace folder; commands will be no-ops until one is opened",
        );
    }
}
