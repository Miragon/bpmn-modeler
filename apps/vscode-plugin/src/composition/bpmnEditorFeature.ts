import { ExtensionContext, window } from "vscode";

import {
    BPMN_VIEW_TYPE,
    BpmnEditorContributions,
    BpmnEditorFeature,
    BpmnPluginsFeature,
    CachedTemplateProvider,
    CodeLinkFeature,
    DefinitionSearchFeature,
    EditorSessionParticipant,
    NavigationFeature,
} from "@miragon/bpmn-modeler-core";
import { BpmnDiffController } from "../diff/adapter/in/BpmnDiffController";
import {
    FocusLintElementController,
    FOCUS_LINT_ELEMENT_CMD,
} from "../modeler/bpmn/adapter/in/FocusLintElementController";
import { PropertiesPanelStateRepository } from "../modeler/bpmn/adapter/out/PropertiesPanelStateRepository";
import { NodeContentHasher } from "../modeler/bpmn/adapter/out/NodeContentHasher";
import { NodeInstalledPackages } from "../modeler/bpmn/adapter/out/NodeInstalledPackages";
import { bpmnPluginCacheUri } from "../shared/adapter/out/bootstrapWebview";
import { VsCodeLintingPreference } from "../modeler/bpmn/adapter/out/VsCodeLintingPreference";
import { ModelerEditorController } from "../modeler/editor-session/adapter/in/ModelerEditorController";
import { VsCodeDiagnostics } from "../shared/adapter/out/VsCodeDiagnostics";
import { SharedDeps } from "./sharedDeps";

interface BpmnEditorHandles {
    diffController: BpmnDiffController;
    marketplaceSvc: CachedTemplateProvider;
    deploymentStatusParticipant: EditorSessionParticipant;
    scriptEditor: BpmnEditorContributions["scriptEditor"];
}

/** Returns both features because the command, marketplace and add-on features reuse their services. */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: BpmnEditorHandles,
): { editor: BpmnEditorFeature; plugins: BpmnPluginsFeature } {
    const ports = {
        store: deps.editorStore,
        documents: deps.vsDocument,
        workspace: deps.vsWorkspace,
        settings: deps.vsSettings,
        notifier: deps.notifier,
        picker: deps.picker,
        artifacts: deps.artifactSvc,
    };
    const navigation = new NavigationFeature(ports);
    const definitionSearch = new DefinitionSearchFeature(ports);
    const codeLink = new CodeLinkFeature(ports);
    // One list and one queue for the plugins and the bpmnlint rule packages: two
    // notices never stand side by side.
    const approvals = deps.pluginApprovals;
    // VS Code announces no write another window makes to the global state.
    context.subscriptions.push(
        window.onDidChangeWindowState((state) => {
            if (state.focused) void approvals.readStored();
        }),
    );
    const questions = deps.approvalQuestions;
    const plugins = new BpmnPluginsFeature({
        ...ports,
        actionNotifier: deps.actionNotifier,
        approvals,
        questions,
        hasher: new NodeContentHasher(),
        cacheRoot: bpmnPluginCacheUri(context.globalStorageUri).fsPath,
    });
    void plugins.pruneCache();
    const editor = new BpmnEditorFeature(
        {
            ...ports,
            statusBar: deps.statusBar,
            clipboard: deps.clipboard,
            diagnostics: new VsCodeDiagnostics(FOCUS_LINT_ELEMENT_CMD),
            templateProvider: handles.marketplaceSvc,
            rulePackages: {
                approvals,
                installedPackages: new NodeInstalledPackages(),
                actionNotifier: deps.actionNotifier,
                questions,
            },
        },
        {
            rendering: "on-host-document-change",
            documentSync: { flushes: deps.flushSvc, pendingEdits: deps.pendingEdits },
            lintingPreference: new VsCodeLintingPreference(),
            propertiesPanelState: new PropertiesPanelStateRepository(context),
        },
        {
            navigation: navigation.editorContribution,
            definitionSearch: definitionSearch.editorContribution,
            deploymentStatus: handles.deploymentStatusParticipant,
            scriptEditor: handles.scriptEditor,
            codeLink: codeLink.editorContribution,
            plugins: plugins.editorContribution,
        },
    );
    context.subscriptions.push(editor, navigation, definitionSearch, codeLink, plugins);

    new ModelerEditorController(deps.editorStore, deps.notifier, deps.createEditorHandle, {
        viewType: BPMN_VIEW_TYPE,
        messageRouter: editor.router,
        participants: editor.participants,
        // Diff routing: when the URI resolves as a diff pane the diff controller
        // owns it, so signal "handled" and skip editor-session creation.
        delegateResolve: (document, panel) => {
            if (!handles.diffController.shouldResolveAsDiff(document.uri)) {
                return false;
            }
            handles.diffController.resolveDiffPane(panel, document);
            return true;
        },
        initialPanelVisible: () => editor.initialPanelVisible(),
    }).register(context);

    // Turns each element-specific bpmnlint diagnostic into a click-to-centre
    // action; the diagnostics carry a command link to this controller.
    new FocusLintElementController(deps.editorStore, deps.notifier).register(context);

    return { editor, plugins };
}
