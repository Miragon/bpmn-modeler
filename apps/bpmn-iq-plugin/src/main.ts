import { ExtensionContext, extensions, window, workspace } from "vscode";

import { BpmnIqBranchSwitchOrchestrator } from "./infrastructure/bpmnIq/BpmnIqBranchSwitchOrchestrator";
import { BpmnIqHttpAdapter } from "./infrastructure/bpmnIq/BpmnIqHttpAdapter";
import { BpmnIqMenu } from "./infrastructure/bpmnIq/BpmnIqMenu";
import { BpmnIqStatusBar } from "./infrastructure/bpmnIq/BpmnIqStatusBar";
import { BpmnIqWorkspaceConfig } from "./infrastructure/bpmnIq/BpmnIqWorkspaceConfig";
import { BpmnIqWorkspaceContextResolver } from "./infrastructure/bpmnIq/BpmnIqWorkspaceContextResolver";
import { vscodeWorkspacePrompts } from "./infrastructure/bpmnIq/vscodeWorkspacePrompts";
import { VsCodeSettings } from "./infrastructure/VsCodeSettings";
import { VsCodeUI } from "./infrastructure/VsCodeUI";
import { BpmnIqSyncService } from "./service/BpmnIqSyncService";
import { BpmnIqWorkspacePuller } from "./service/BpmnIqWorkspacePuller";
import {
    BPMN_IQ_SHOW_MENU_COMMAND,
    BpmnIqController,
} from "./controller/BpmnIqController";

/**
 * Public API surface of the BPMN modeler extension this plugin requires.
 *
 * Imported via `extensions.getExtension(...).activate()`.  The modeler is
 * a hard `extensionDependencies` entry in our `package.json`, so VS Code
 * guarantees it is installed and activated before us.
 */
interface BpmnModelerApi {
    readonly onDidChangeSelection: import("vscode").Event<{
        uri: import("vscode").Uri;
        elementId?: string;
    }>;
}

/** VS Code extension id of the BPMN modeler this plugin depends on. */
const BPMN_MODELER_EXTENSION_ID = "miragon-gmbh.vs-code-bpmn-modeler";

/**
 * Activation entry point for the bpmn-iq plugin.
 *
 * Wires infrastructure → service → controller, then opens two streams that
 * keep the daemon's session model in sync with what the user is doing:
 *
 * - `window.onDidChangeActiveTextEditor` — pushes the active model on tab
 *   switches.  No coupling to the modeler needed; any `.bpmn` editor
 *   (custom or text) qualifies.
 * - `BpmnModelerApi.onDidChangeSelection` — pushes the active model AND
 *   element on canvas-selection changes.  The modeler is a required
 *   `extensionDependencies` entry, so it is always available at activation.
 */
export function activate(context: ExtensionContext): void {
    const config = new BpmnIqWorkspaceConfig();
    const settings = new VsCodeSettings();
    const vsUI = new VsCodeUI();
    context.subscriptions.push(vsUI);
    const portFactory = (baseUrl: string, workspaceId: string) =>
        new BpmnIqHttpAdapter(baseUrl, workspaceId);

    const syncService = new BpmnIqSyncService(portFactory, vsUI);
    context.subscriptions.push(syncService);

    const statusBar = new BpmnIqStatusBar(BPMN_IQ_SHOW_MENU_COMMAND, () =>
        settings.getDaemonUrl(),
    );
    const menu = new BpmnIqMenu();
    const contextResolver = new BpmnIqWorkspaceContextResolver(
        config,
        vscodeWorkspacePrompts,
    );
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

    // Selection-aware session updates via the modeler API.  Required: the
    // `extensionDependencies` entry in package.json guarantees the modeler
    // is installed and activated before us, so this should always resolve.
    // The defensive throw exists to surface a mis-configured environment
    // (e.g. a forced --skip-extensions launch) instead of silently degrading.
    const modelerExt = extensions.getExtension<BpmnModelerApi>(BPMN_MODELER_EXTENSION_ID);
    if (!modelerExt) {
        throw new Error(
            `Required extension ${BPMN_MODELER_EXTENSION_ID} is not installed`,
        );
    }
    void modelerExt.activate().then((api) => {
        context.subscriptions.push(
            api.onDidChangeSelection(({ uri, elementId }) => {
                if (!syncService.isRunning) return;
                const modelId = syncService.buildActiveModelId(uri.path);
                if (!modelId) return;
                void syncService.setSessionActive({ modelId, elementId });
            }),
        );
    });

    // If activated outside a workspace folder, log once. Status bar still
    // shows but `start()` will surface the "open a folder first" toast.
    if (!workspace.workspaceFolders?.length) {
        vsUI.logInfo("activated without a workspace folder; commands will be no-ops until one is opened");
    }
}
