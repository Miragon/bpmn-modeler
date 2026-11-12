import { commands, env, ExtensionContext, workspace } from "vscode";

import {
    AllowanceLocator,
    ContentRowMigration,
    EditorSessionStore,
    StatusItemOwnership,
} from "@miragon/bpmn-modeler-core";
import { EditorSessionDocuments } from "@miragon/bpmn-modeler-core";
import { VsCodeWorkspace } from "../shared/adapter/out/VsCodeWorkspace";
import { VsCodeSettings } from "../shared/adapter/out/VsCodeSettings";
import { VsCodeStatusBar } from "../shared/adapter/out/VsCodeStatusBar";
import { VsCodeNotifier } from "../shared/adapter/out/VsCodeNotifier";
import { VsCodePicker } from "../shared/adapter/out/VsCodePicker";
import { VsCodeActionNotifier } from "../shared/adapter/out/VsCodeActionNotifier";
import { VsCodeClipboard } from "../shared/adapter/out/VsCodeClipboard";
import { VsCodeWorkspaceTrust } from "../shared/adapter/out/VsCodeWorkspaceTrust";
import { VsCodeTextEditor } from "../shared/adapter/in/VsCodeTextEditor";
import { VsCodeEditorHandle } from "../shared/adapter/out/VsCodeEditorHandle";
import { vsCodeModelerPreferences } from "../shared/adapter/out/modelerConfiguration";
import { ModelerPreferences } from "../shared/port/ModelerPreferences";
import { EditorHandleFactory } from "../modeler/editor-session/adapter/in/ModelerEditorController";
import { ArtifactService, QuestionQueue } from "@miragon/bpmn-modeler-core";
import { DocumentFlushService, PendingEditsFlush } from "@miragon/bpmn-modeler-core";
import { VsCodePluginApprovalStore } from "../modeler/bpmn/adapter/out/VsCodePluginApprovalStore";
import { VsCodeTemplatePreferenceStore } from "../modeler/bpmn/adapter/out/VsCodeTemplatePreferenceStore";
import { NodeInstalledPackages } from "../modeler/bpmn/adapter/out/NodeInstalledPackages";
import { originHostOf } from "../shared/domain/originHost";

/**
 * The cross-cutting collaborators every feature draws from: the host-capability
 * adapters, the shared editor-session registry, the one stateless service
 * (`artifactSvc`) consumed by two unrelated features, and the flush that
 * writes a webview's pending edits into its document. Bundling them lets each
 * feature's `register()` take a single `deps` argument instead of a long,
 * order-sensitive parameter list that `main.ts` would have to thread by hand.
 */
export interface SharedDeps {
    editorStore: EditorSessionStore;
    engineVersionOwnership: StatusItemOwnership;
    vsDocument: EditorSessionDocuments;
    vsWorkspace: VsCodeWorkspace;
    vsSettings: VsCodeSettings;
    statusBar: VsCodeStatusBar;
    notifier: VsCodeNotifier;
    picker: VsCodePicker;
    actionNotifier: VsCodeActionNotifier;
    clipboard: VsCodeClipboard;
    textEditor: VsCodeTextEditor;
    preferences: ModelerPreferences;
    createEditorHandle: EditorHandleFactory;
    artifactSvc: ArtifactService;
    flushSvc: DocumentFlushService;
    pendingEdits: PendingEditsFlush;
    /** The one approval list the plugins, the rule packages and the add-on catalog share. */
    pluginApprovals: VsCodePluginApprovalStore;
    /** Every approval question, so two notices never stand side by side. */
    approvalQuestions: QuestionQueue;
    /** The user's template switches, which the BPMN editor and the add-on catalog share. */
    templatePreferences: VsCodeTemplatePreferenceStore;
    /** The one reader of installed packages and git files, for the plugins, the rule packages and the allowances. */
    installedPackages: NodeInstalledPackages;
    allowances: AllowanceLocator;
    contentRows: ContentRowMigration;
    /** Read by the plugins, the rule packages and the add-on catalog. */
    workspaceTrust: VsCodeWorkspaceTrust;
}

/**
 * Constructs the collaborators shared across features exactly once, so every
 * feature observes the same session registry and adapter instances. Only
 * genuinely cross-feature objects live here; feature-specific adapters are
 * built inside the owning feature's `register()`.
 */
export function buildSharedDeps(context: ExtensionContext): SharedDeps {
    // The open-editor count drives the `when`-clause context key for
    // keybindings/menus. Injected here so the store names no `vscode` API.
    const editorStore = new EditorSessionStore((count) =>
        commands.executeCommand("setContext", "bpmn-modeler.openCustomEditors", count),
    );
    context.subscriptions.push(editorStore);

    const vsWorkspace = new VsCodeWorkspace();
    const vsSettings = new VsCodeSettings();
    // Hoisted so it can seed ArtifactService's optional logger for the
    // element-template discovery diagnostics.
    const notifier = new VsCodeNotifier();
    // One flush service for every editor: requests are keyed per editorId.
    const flushSvc = new DocumentFlushService(editorStore, notifier);
    const pluginApprovals = new VsCodePluginApprovalStore(context.globalState);
    const installedPackages = new NodeInstalledPackages();
    // A window changes its remote or its first folder only through an extension host restart.
    const allowances = new AllowanceLocator(
        installedPackages,
        originHostOf(env.remoteName, workspace.workspaceFolders?.map(({ uri }) => uri) ?? []),
    );

    return {
        editorStore,
        engineVersionOwnership: new StatusItemOwnership(),
        vsDocument: new EditorSessionDocuments(editorStore),
        vsWorkspace,
        vsSettings,
        statusBar: new VsCodeStatusBar(),
        notifier,
        picker: new VsCodePicker(),
        actionNotifier: new VsCodeActionNotifier(),
        clipboard: new VsCodeClipboard(),
        textEditor: new VsCodeTextEditor(context.subscriptions),
        preferences: vsCodeModelerPreferences,
        createEditorHandle: VsCodeEditorHandle.create,
        artifactSvc: new ArtifactService(vsWorkspace, vsSettings, notifier),
        flushSvc,
        pendingEdits: new PendingEditsFlush(editorStore, flushSvc, notifier),
        pluginApprovals,
        approvalQuestions: new QuestionQueue(),
        templatePreferences: new VsCodeTemplatePreferenceStore({
            project: context.workspaceState,
            allProjects: context.globalState,
        }),
        installedPackages,
        allowances,
        contentRows: new ContentRowMigration(pluginApprovals, allowances, notifier),
        workspaceTrust: new VsCodeWorkspaceTrust(),
    };
}
