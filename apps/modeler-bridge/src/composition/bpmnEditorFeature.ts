import {
    BpmnEditorContributions,
    BpmnEditorFeature,
    CachedTemplateProvider,
    CodeLinkFeature,
    DefinitionSearchFeature,
    EditorSessionParticipant,
    NavigationFeature,
} from "@miragon/bpmn-modeler-core";

import { RpcClipboard, RpcLintingPreference } from "../adapters";
import { METHODS } from "../protocol/descriptor";
import { SettingsDidChangeParams } from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The BPMN editor is the core {@link BpmnEditorFeature} over the bridge's
 * ports, the same one VS Code builds. Navigation, definition search and
 * code-link contribute from the core; the script editor and the deployment
 * status arrive from their bridge features. The host renders on
 * `document/didChange` because it owns the document revision, it keeps no
 * properties-panel visibility, and it stores the lint choice that
 * {@link RpcLintingPreference} reports.
 *
 * RPC (Host → Core): settings/didChange, linting/toggle (the status widget's
 * click).
 */
export function register(
    deps: BridgeSharedDeps,
    handles: {
        onSettingsApplied: () => void;
        templateProvider?: CachedTemplateProvider;
        scriptEditor: BpmnEditorContributions["scriptEditor"];
        deploymentStatus: EditorSessionParticipant;
    },
): BpmnEditorFeature {
    const ports = {
        store: deps.store,
        documents: deps.documentPort,
        workspace: deps.nodeWorkspace,
        settings: deps.settings,
        notifier: deps.notifier,
        picker: deps.picker,
        artifacts: deps.artifactSvc,
    };
    const lintingPreference = new RpcLintingPreference(deps.rpc);
    const editor = new BpmnEditorFeature(
        {
            ...ports,
            statusBar: deps.statusBar,
            // The host reads and writes the system clipboard over RPC for the
            // sandboxed webview.
            clipboard: new RpcClipboard(deps.rpc),
            templateProvider: handles.templateProvider,
        },
        {
            rendering: "host-driven",
            documentSync: { flushes: deps.flushSvc, pendingEdits: deps.pendingEdits },
            lintingPreference,
        },
        {
            navigation: new NavigationFeature(ports).editorContribution,
            definitionSearch: new DefinitionSearchFeature(ports).editorContribution,
            deploymentStatus: handles.deploymentStatus,
            scriptEditor: handles.scriptEditor,
            codeLink: new CodeLinkFeature(ports).editorContribution,
        },
    );

    // One host frame updates every open editor: `apply` fires a SettingChange that
    // each session's broadcaster + configFolder listener turn into webview pushes.
    // Diff panes aren't editor sessions, so they need an explicit locale re-push,
    // delivered via the diff feature's `rebroadcastLanguage` callback.
    deps.rpc.on(METHODS.settingsDidChange, (params: SettingsDidChangeParams) => {
        deps.settings.apply(params.settings);
        handles.onSettingsApplied();
    });
    deps.rpc.on(METHODS.lintingToggle, () =>
        lintingPreference.setLintingEnabled(!deps.settings.getLintingEnabled()),
    );

    return editor;
}
