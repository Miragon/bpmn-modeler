import { ExtensionContext } from "vscode";

import {
    BPMN_VIEW_TYPE,
    BpmnEditorContributions,
    BpmnEditorFeature,
    CachedTemplateProvider,
    CodeLinkFeature,
    DefinitionSearchFeature,
    EditorSessionParticipant,
    NavigationFeature,
} from "@miragon/bpmn-modeler-core";
import { BpmnDiffController } from "../diff/controller/BpmnDiffController";
import {
    FocusLintElementController,
    FOCUS_LINT_ELEMENT_CMD,
} from "../modeler/bpmn/controller/FocusLintElementController";
import { PropertiesPanelStateRepository } from "../modeler/bpmn/infrastructure/PropertiesPanelStateRepository";
import { VsCodeLintingPreference } from "../modeler/bpmn/infrastructure/VsCodeLintingPreference";
import { ModelerEditorController } from "../modeler/editor-session/ModelerEditorController";
import { VsCodeDiagnostics } from "../shared/infrastructure/VsCodeDiagnostics";
import { SharedDeps } from "./sharedDeps";

interface BpmnEditorHandles {
    diffController: BpmnDiffController;
    marketplaceSvc: CachedTemplateProvider;
    deploymentStatusParticipant: EditorSessionParticipant;
    scriptEditor: BpmnEditorContributions["scriptEditor"];
}

/** Returns the feature because the command and marketplace features reuse its services. */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: BpmnEditorHandles,
): BpmnEditorFeature {
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
    const editor = new BpmnEditorFeature(
        {
            ...ports,
            statusBar: deps.statusBar,
            clipboard: deps.clipboard,
            diagnostics: new VsCodeDiagnostics(FOCUS_LINT_ELEMENT_CMD),
            templateProvider: handles.marketplaceSvc,
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
        },
    );
    context.subscriptions.push(editor, navigation, definitionSearch, codeLink);

    new ModelerEditorController(deps.editorStore, deps.notifier, {
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

    return editor;
}
