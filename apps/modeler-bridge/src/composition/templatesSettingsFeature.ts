import {
    BpmnElementTemplatesService,
    BpmnSettingsBroadcaster,
    BpmnSettingsParticipant,
    CachedTemplateProvider,
    EditorSessionParticipant,
    ElementTemplatesParticipant,
    getBpmnModelerSettingHandler,
    getElementTemplatesHandler,
} from "@miragon/bpmn-modeler-core";

import { METHODS } from "../protocol/descriptor";
import { SettingsDidChangeParams } from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The templates/settings feature owns element-template discovery
 * ({@link BpmnElementTemplatesService}) and the settings broadcaster. The diff
 * dependency arrives as a plain `onSettingsApplied` callback so this module never
 * imports diff types — the route is named in `createBridge`. Per session, the
 * core template and settings participants — the ones VS Code runs — arm the
 * template watcher and keep settings in sync.
 *
 * Webview messages: GetElementTemplatesCommand, GetBpmnModelerSettingCommand.
 * RPC (Host → Core): settings/didChange.
 *
 * `marketplaceSvc` (optional) merges the marketplace cache into element-template
 * discovery; absent, the workspace-only behaviour is unchanged. It is built by
 * the marketplace feature before this one so its cache can be threaded in here.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: { onSettingsApplied: () => void; marketplaceSvc?: CachedTemplateProvider },
): { participants: EditorSessionParticipant[]; templatesSvc: BpmnElementTemplatesService } {
    const templatesSvc = new BpmnElementTemplatesService(
        deps.store,
        deps.documentPort,
        deps.artifactSvc,
        deps.statusBar,
        deps.notifier,
        handles.marketplaceSvc,
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

    deps.router
        .on("GetElementTemplatesCommand", getElementTemplatesHandler(templatesSvc))
        .on("GetBpmnModelerSettingCommand", getBpmnModelerSettingHandler(settingsBroadcaster));

    // One host frame updates every open editor: `apply` fires a SettingChange that
    // each session's broadcaster + configFolder listener turn into webview pushes.
    // Diff panes aren't editor sessions, so they need an explicit locale re-push,
    // delivered via the diff feature's `rebroadcastLanguage` callback.
    deps.rpc.on(METHODS.settingsDidChange, (params: SettingsDidChangeParams) => {
        deps.settings.apply(params.settings);
        handles.onSettingsApplied();
    });

    return {
        templatesSvc,
        participants: [
            new ElementTemplatesParticipant(templatesSvc, deps.artifactSvc, deps.notifier),
            new BpmnSettingsParticipant(settingsBroadcaster),
        ],
    };
}
