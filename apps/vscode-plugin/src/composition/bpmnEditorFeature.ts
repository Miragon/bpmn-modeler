import { ExtensionContext, window } from "vscode";

import {
    BPMN_VIEW_TYPE,
    ApprovalReviewPort,
    BpmnEditorContributions,
    BpmnEditorFeature,
    BpmnPluginsFeature,
    CachedTemplateProvider,
    CodeLinkFeature,
    DefinitionSearchFeature,
    EditorSessionParticipant,
    NavigationFeature,
} from "@miragon/bpmn-modeler-core";
import { DiffController } from "../diff/adapter/in/DiffController";
import {
    FocusLintElementController,
    FOCUS_LINT_ELEMENT_CMD,
} from "../modeler/bpmn/adapter/in/FocusLintElementController";
import {
    ElementIdReviewController,
    REVEAL_ELEMENT_ID_ROW_CMD,
} from "../modeler/bpmn/adapter/in/ElementIdReviewController";
import { PropertiesPanelStateRepository } from "../modeler/bpmn/adapter/out/PropertiesPanelStateRepository";
import { VsCodeElementIdReview } from "../modeler/bpmn/adapter/out/VsCodeElementIdReview";
import { NodeContentHasher } from "../modeler/bpmn/adapter/out/NodeContentHasher";
import { bpmnPluginCacheUri } from "../shared/adapter/out/bootstrapWebview";
import { VsCodeLintingPreference } from "../modeler/bpmn/adapter/out/VsCodeLintingPreference";
import { ModelerEditorController } from "../modeler/editor-session/adapter/in/ModelerEditorController";
import { VsCodeDiagnostics } from "../shared/adapter/out/VsCodeDiagnostics";
import { SharedDeps } from "./sharedDeps";

interface BpmnEditorHandles {
    diffController: DiffController;
    templateSources: CachedTemplateProvider;
    deploymentStatusParticipant: EditorSessionParticipant;
    scriptEditor: BpmnEditorContributions["scriptEditor"];
    reviews: { plugin: ApprovalReviewPort; rulePackage: ApprovalReviewPort };
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
            if (!state.focused) return;
            void approvals.readStored();
            void deps.templatePreferences.readStored();
        }),
    );
    const questions = deps.approvalQuestions;
    const plugins = new BpmnPluginsFeature({
        ...ports,
        actionNotifier: deps.actionNotifier,
        approvals,
        allowances: deps.allowances,
        contentRows: deps.contentRows,
        questions,
        hasher: new NodeContentHasher(),
        cacheRoot: bpmnPluginCacheUri(context.globalStorageUri).fsPath,
        review: handles.reviews.plugin,
        workspaceTrust: deps.workspaceTrust,
    });
    void plugins.pruneIdleCopies();
    // Before any editor resolves, so the first request already finds the rows it rewrites.
    void deps.contentRows.run();
    const elementIdReview = VsCodeElementIdReview.isSupported()
        ? new VsCodeElementIdReview(REVEAL_ELEMENT_ID_ROW_CMD)
        : undefined;
    const editor = new BpmnEditorFeature(
        {
            ...ports,
            statusBar: deps.statusBar,
            clipboard: deps.clipboard,
            diagnostics: new VsCodeDiagnostics(FOCUS_LINT_ELEMENT_CMD),
            templateProvider: handles.templateSources,
            templatePreferences: deps.templatePreferences,
            rulePackages: {
                approvals,
                installedPackages: deps.installedPackages,
                allowances: deps.allowances,
                contentRows: deps.contentRows,
                actionNotifier: deps.actionNotifier,
                questions,
                review: handles.reviews.rulePackage,
                workspaceTrust: deps.workspaceTrust,
            },
            elementIdReview,
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
        delegateResolve: handles.diffController.resolveWhenDiffPane,
        initialPanelVisible: () => editor.initialPanelVisible(),
    }).register(context);

    if (elementIdReview) {
        new ElementIdReviewController(elementIdReview, editor.elementIds, deps.notifier).register(
            context,
        );
    }

    // Turns each element-specific bpmnlint diagnostic into a click-to-centre
    // action; the diagnostics carry a command link to this controller.
    new FocusLintElementController(deps.editorStore, deps.notifier).register(context);

    return { editor, plugins };
}
