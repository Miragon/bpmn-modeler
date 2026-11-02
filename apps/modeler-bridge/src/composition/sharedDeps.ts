import {
    ArtifactService,
    DocumentFlushService,
    EditorSessionStore,
    PendingEditsFlush,
} from "@miragon/bpmn-modeler-core";

import { DocumentMirror, RpcDocumentPort, RpcNotifier, RpcPicker, RpcStatusBar } from "../adapters";
import { BridgeSettings, NodeWorkspace } from "../nodeAdapters";
import { Rpc } from "../rpc";

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
        store,
        artifactSvc,
        flushSvc,
        pendingEdits: new PendingEditsFlush(store, flushSvc, notifier),
    };
}
