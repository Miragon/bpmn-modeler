import {
    ApprovalReviewPort,
    BpmnEditorContributions,
    BpmnEditorFeature,
    CachedTemplateProvider,
    CodeLinkFeature,
    DefinitionSearchFeature,
    EditorSessionParticipant,
    NavigationFeature,
} from "@miragon/bpmn-modeler-core";

import { templatePreferenceHandlers } from "../kernel/adapter/in/templatePreferenceHandlers";
import { workspaceTrustHandlers } from "../kernel/adapter/in/workspaceTrustHandlers";
import { RpcClipboard } from "../kernel/adapter/out/RpcClipboard";
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
        /** Where "Review…" on a rule package takes the user. */
        rulePackageReview: ApprovalReviewPort;
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
            templatePreferences: deps.templatePreferences,
            rulePackages: {
                approvals: deps.pluginApprovals,
                installedPackages: deps.installedPackages,
                allowances: deps.allowances,
                contentRows: deps.contentRows,
                actionNotifier: deps.actionNotifier,
                questions: deps.approvalQuestions,
                review: handles.rulePackageReview,
                workspaceTrust: deps.workspaceTrust,
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
    bindHandlers(deps.rpc, templatePreferenceHandlers(deps.templatePreferences));
    bindHandlers(deps.rpc, workspaceTrustHandlers(deps.workspaceTrust));

    return editor;
}
