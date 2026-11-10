import {
    ArtifactService,
    DocumentFlushService,
    EditorSessionStore,
    PendingEditsFlush,
    QuestionQueue,
} from "@miragon/bpmn-modeler-core";

import { RpcPluginApprovalStore } from "../bpmnPlugins/adapter/out/RpcPluginApprovalStore";
import { DocumentMirror } from "../editorSession/domain/DocumentMirror";
import { RpcDocumentPort } from "../editorSession/adapter/out/RpcDocumentPort";
import { RpcActionNotifier } from "../kernel/adapter/out/RpcActionNotifier";
import { RpcNotifier } from "../kernel/adapter/out/RpcNotifier";
import { RpcPicker } from "../kernel/adapter/out/RpcPicker";
import { RpcStatusBar } from "../kernel/adapter/out/RpcStatusBar";
import { RpcTemplatePreferenceStore } from "../kernel/adapter/out/RpcTemplatePreferenceStore";
import { BridgeSettings } from "../kernel/adapter/out/BridgeSettings";
import { NodeWorkspace } from "../kernel/adapter/out/NodeWorkspace";
import { Rpc } from "../transport/adapter/out/Rpc";

/**
 * The cross-cutting collaborators every bridge feature draws from: the RPC peer,
 * the host-capability port adapters, the shared editor-session registry, the
 * stateless `artifactSvc` consumed by templates, code-link, and deployment, and
 * the flush that writes a webview's pending edits into its document.
 * Bundling them lets each feature's `register()` take a single `deps` argument
 * instead of the long, order-sensitive parameter list `createBridge` would
 * otherwise thread by hand — the bridge analogue of the VS Code `SharedDeps`.
 */
export interface BridgeSharedDeps {
    rpc: Rpc;
    log: (message: string) => void;
    mirror: DocumentMirror;
    notifier: RpcNotifier;
    statusBar: RpcStatusBar;
    documentPort: RpcDocumentPort;
    nodeWorkspace: NodeWorkspace;
    settings: BridgeSettings;
    picker: RpcPicker;
    actionNotifier: RpcActionNotifier;
    /**
     * Seeded by `session/register`, so it is shared with the editor-session
     * feature; the plugins and the bpmnlint rule packages keep their rows in it.
     */
    pluginApprovals: RpcPluginApprovalStore;
    /**
     * Seeded by `session/register`, so it is shared with the editor-session
     * feature; the editor hides the templates it switches off, and the add-on
     * catalog offers the switches.
     */
    templatePreferences: RpcTemplatePreferenceStore;
    /** Every approval question, so two notices never stand side by side. */
    approvalQuestions: QuestionQueue;
    store: EditorSessionStore;
    artifactSvc: ArtifactService;
    flushSvc: DocumentFlushService;
    pendingEdits: PendingEditsFlush;
}

/**
 * Constructs the collaborators shared across features exactly once, so every
 * feature observes the same RPC peer, session registry, router, and adapter
 * instances. Only genuinely cross-feature objects live here; feature-specific
 * infrastructure (services, maps, flags) is built inside the owning feature's
 * `register()`.
 */
export function buildSharedDeps(
    write: (line: string) => void,
    log: (message: string) => void,
): BridgeSharedDeps {
    const rpc = new Rpc(write);

    const mirror = new DocumentMirror();
    const notifier = new RpcNotifier(rpc);
    const statusBar = new RpcStatusBar(rpc);
    const documentPort = new RpcDocumentPort(rpc, mirror);

    // The element-templates pipeline is the *real* production stack: the only new
    // code is the two pure-fs/host-fed port adapters (NodeWorkspace/BridgeSettings).
    // This is what makes the status-bar template count genuine rather than a placeholder.
    const nodeWorkspace = new NodeWorkspace();
    const settings = new BridgeSettings();

    const picker = new RpcPicker(rpc);

    // onOpenCountChanged is the VS Code setContext hook; irrelevant out-of-process.
    const store = new EditorSessionStore(() => {});

    const artifactSvc = new ArtifactService(nodeWorkspace, settings, notifier);

    const flushSvc = new DocumentFlushService(store, notifier);

    return {
        rpc,
        log,
        mirror,
        notifier,
        statusBar,
        documentPort,
        nodeWorkspace,
        settings,
        picker,
        actionNotifier: new RpcActionNotifier(rpc),
        pluginApprovals: new RpcPluginApprovalStore(rpc),
        templatePreferences: new RpcTemplatePreferenceStore(rpc),
        approvalQuestions: new QuestionQueue(),
        store,
        artifactSvc,
        flushSvc,
        pendingEdits: new PendingEditsFlush(store, flushSvc, notifier),
    };
}
