import { Command } from "@miragon/bpmn-modeler-shared";
import { BpmnElementTemplatesService, BpmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../protocol/descriptor";
import { RegisterParams, SettingsDidChangeParams } from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";
import { SessionHooks } from "./sessionHooks";

/**
 * The templates/settings feature owns element-template discovery
 * ({@link BpmnElementTemplatesService}), the settings broadcaster, and the
 * per-session template watchers. The diff dependency arrives as a plain
 * `onSettingsApplied` callback so this module never imports diff types — the
 * route is named in `createBridge`. Its session hook arms the per-session
 * settings/template wiring on register and disposes the watcher on dispose.
 *
 * Webview messages: GetElementTemplatesCommand, GetBpmnModelerSettingCommand.
 * RPC (Host → Core): settings/didChange.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: { onSettingsApplied: () => void },
): { sessionHooks: SessionHooks } {
    const templatesSvc = new BpmnElementTemplatesService(
        deps.store,
        deps.documentPort,
        deps.artifactSvc,
        deps.statusBar,
        deps.notifier,
    );

    // The same broadcaster the VS Code host uses: on a settings change it re-pushes
    // modeler settings + language to the webview. It is `vscode`-free, so it runs
    // here unmodified — the only difference is the change events come from the
    // host's RPC snapshots rather than `workspace.onDidChangeConfiguration`.
    const settingsBroadcaster = new BpmnSettingsBroadcaster(
        deps.store,
        deps.settings,
        deps.notifier,
    );

    const watchers = new Map<string, { dispose(): void }[]>();

    deps.router
        // Inlined rather than importing the VS Code element-templates handler,
        // whose module pulls in `VsCodeNotifier` → `vscode`, which we must avoid.
        .on("GetElementTemplatesCommand", (_m: Command, editorId: string) => {
            void templatesSvc.setElementTemplates(editorId);
        })
        // The webview re-requests settings on every (re)load; push the live snapshot
        // and language, mirroring the VS Code `getBpmnModelerSettingHandler`.
        .on("GetBpmnModelerSettingCommand", (_m: Command, editorId: string) => {
            void settingsBroadcaster.setSettings(editorId);
            settingsBroadcaster.setLanguage(editorId);
        });

    // One host frame updates every open editor: `apply` fires a SettingChange that
    // each session's broadcaster + configFolder listener turn into webview pushes.
    // Diff panes aren't editor sessions, so they need an explicit locale re-push,
    // delivered via the diff feature's `rebroadcastLanguage` callback.
    deps.rpc.on(METHODS.settingsDidChange, (params: SettingsDidChangeParams) => {
        deps.settings.apply(params.settings);
        handles.onSettingsApplied();
    });

    return {
        sessionHooks: {
            onSessionRegistered: async (params: RegisterParams) => {
                // Mirrors SettingsParticipant + ElementTemplatesParticipant: re-push
                // modeler/language settings on change, and reload templates when the
                // config folder moves. Both ride the BridgeSettings change hub via the
                // handle's onDidChangeSetting; disposed with the session by the store.
                settingsBroadcaster.subscribe(params.editorId);
                deps.store.subscribeToSettingChangeEvent(params.editorId, (event, editorId) => {
                    if (event.affectsConfiguration("miragon.bpmnModeler.configFolder")) {
                        void templatesSvc.setElementTemplates(editorId);
                    }
                });

                // Arm the live-reload watcher (the production `ArtifactService`
                // wiring, reused verbatim). The authoritative root is registered by
                // the editor-session feature before this hook runs.
                const { disposables } = await deps.artifactSvc.createWatcher(
                    params.editorId,
                    templatesSvc,
                );
                watchers.set(params.editorId, disposables);
            },
            onSessionDisposed: (editorId) => {
                watchers.get(editorId)?.forEach((d) => d.dispose());
                watchers.delete(editorId);
            },
        },
    };
}
