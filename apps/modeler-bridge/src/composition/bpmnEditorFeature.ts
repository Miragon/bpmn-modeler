import {
    BpmnEditorContributions,
    BpmnEditorFeature,
    CachedTemplateProvider,
    CodeLinkFeature,
    DefinitionSearchFeature,
    EditorSessionParticipant,
    NavigationFeature,
} from "@miragon/bpmn-modeler-core";

import { RpcClipboard } from "../kernel/adapter/out/RpcClipboard";
import { NodeInstalledPackages } from "../modeler/bpmn/adapter/out/NodeInstalledPackages";
import { RpcLintingPreference } from "../modeler/bpmn/adapter/out/RpcLintingPreference";
import { bpmnEditorHandlers } from "../modeler/bpmn/adapter/in/bpmnEditorHandlers";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The BPMN editor is the core {@link BpmnEditorFeature} over the bridge's
 * ports, the same one VS Code builds. Navigation, definition search and
 * code-link contribute from the core; the script editor, the deployment
 * status and the workspace plugins arrive from their bridge features. A workspace
 * bpmnlint rule package runs once the user allowed it, asked through the queue
 * and kept in the list the plugins use. The host renders on
 * `document/didChange` because it owns the document revision, it keeps no
 * properties-panel visibility, and it stores the lint choice that
 * {@link RpcLintingPreference} reports.
 */
export function register(
    deps: BridgeSharedDeps,
    handles: {
        onSettingsApplied: () => void;
        templateProvider?: CachedTemplateProvider;
        scriptEditor: BpmnEditorContributions["scriptEditor"];
        deploymentStatus: EditorSessionParticipant;
        plugins: BpmnEditorContributions["plugins"];
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
            rulePackages: {
                approvals: deps.pluginApprovals,
                installedPackages: new NodeInstalledPackages(),
                actionNotifier: deps.actionNotifier,
                questions: deps.approvalQuestions,
            },
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
            plugins: handles.plugins,
        },
    );

    bindHandlers(
        deps.rpc,
        bpmnEditorHandlers({
            settingsMirror: deps.settings,
            settings: deps.settings,
            lintingPreference,
            onSettingsApplied: handles.onSettingsApplied,
        }),
    );

    return editor;
}
