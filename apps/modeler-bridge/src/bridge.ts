/**
 * Wires the **real**, unmodified BPMN core (`EditorSessionStore` +
 * `BpmnModelerService` + `WebviewMessageRouter`) to the RPC-backed host ports,
 * transport-agnostically: it takes a `write` sink and returns the live
 * {@link Rpc} peer. `server.ts` binds this to stdio; tests bind it to a capture
 * array. Keeping the wiring out of the stdio entrypoint is what makes the
 * register → display → `editor/postMessage` loop unit-testable without spawning
 * a process.
 *
 * The whole point of the out-of-process design: the TypeScript core drives a
 * remote host without being rewritten, so the only per-host maintenance surface
 * is the thin set of port adapters. The host implements the ports as RPC
 * handlers; the core never knows it isn't talking to VS Code.
 *
 * Protocol (see {@link Rpc} for framing):
 *   Host → Core (notifications): session/register, webview/message,
 *                                document/didChange, session/dispose
 *   Core → Host (requests):      document/write, document/save
 *   Core → Host (notifications): editor/postMessage, notifier/*, statusBar/*
 *
 * Diff, DMN, and deployment are deliberately out of scope here — they are their
 * own follow-up issues (#1067–#1069+); this is the BPMN-editor foundation.
 */

import { Command, Query, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";
import {
    ArtifactService,
    BpmnElementTemplatesService,
    BpmnModelerService,
    EditorSessionStore,
    WebviewMessageRouter,
} from "@miragon/bpmn-modeler-core";

import {
    DocumentMirror,
    RpcDocumentPort,
    RpcEditorHandle,
    RpcNotifier,
    RpcStatusBar,
    SessionMeta,
    StubPicker,
} from "./adapters";
import { NodeSettings, NodeWorkspace } from "./nodeAdapters";
import { Rpc } from "./rpc";

/** Builds a typed-but-stub host reply. The webview only reads `.type`, so a plain object is enough. */
function query(type: string, fields: Record<string, unknown>): Query {
    return { type, ...fields } as unknown as Query;
}

interface RegisterParams extends SessionMeta {
    content: string;
}

/**
 * Constructs the bridge: the core, the RPC peer, and every host→core handler.
 *
 * @param write Emits one framed JSON line (caller appends the newline + flushes).
 * @param log   Diagnostic sink (stderr in production; a spy in tests). Kept off
 *              the RPC `write` so it can never corrupt the stdout frame stream.
 * @returns the live {@link Rpc} peer — feed it inbound lines via `handleLine`.
 */
export function createBridge(
    write: (line: string) => void,
    log: (message: string) => void = () => {},
): { rpc: Rpc } {
    const rpc = new Rpc(write);

    const mirror = new DocumentMirror();
    const notifier = new RpcNotifier(rpc);
    const picker = new StubPicker();
    const statusBar = new RpcStatusBar(rpc);
    const documentPort = new RpcDocumentPort(rpc, mirror);

    // onOpenCountChanged is the VS Code setContext hook; irrelevant out-of-process.
    const store = new EditorSessionStore(() => {});
    const bpmnService = new BpmnModelerService(store, documentPort, picker, statusBar, notifier);

    // The element-templates pipeline is the *real* production stack: the only new
    // code is the two pure-fs port adapters (NodeWorkspace/NodeSettings). This is
    // what makes the status-bar template count genuine rather than a placeholder.
    const nodeWorkspace = new NodeWorkspace();
    const nodeSettings = new NodeSettings();
    const artifactSvc = new ArtifactService(nodeWorkspace, nodeSettings);
    const templatesSvc = new BpmnElementTemplatesService(
        store,
        documentPort,
        artifactSvc,
        statusBar,
        notifier,
    );

    const handles = new Map<string, RpcEditorHandle>();
    const watchers = new Map<string, { dispose(): void }[]>();

    // The real webview-message dispatch table. The file/sync handlers call the
    // genuine service; the remaining handshake replies are bridge-level stubs
    // because their real services (settings, properties panel, clipboard) pull in
    // host ports that are later issues (#1063–#1066). They must still answer, or
    // the webview's `Promise.all` over templates+settings+panel-state never
    // resolves and bootstrap stalls.
    const router = new WebviewMessageRouter();
    router
        .on("GetBpmnFileCommand", async (_message: Command, editorId: string) => {
            if (await bpmnService.display(editorId)) {
                notifier.logInfo("BPMN modeler is ready");
            }
        })
        .on("SyncDocumentCommand", async (message: Command, editorId: string) => {
            await bpmnService.sync(editorId, (message as SyncDocumentCommand).content);
        })
        // Inlined rather than importing the VS Code element-templates handler,
        // whose module pulls in `VsCodeNotifier` → `vscode`, which we must avoid.
        .on("GetElementTemplatesCommand", (_m: Command, editorId: string) => {
            void templatesSvc.setElementTemplates(editorId);
        })
        .on("GetBpmnModelerSettingCommand", (_m: Command, editorId: string) => {
            store.postMessage(
                editorId,
                query("BpmnModelerSettingQuery", {
                    setting: {
                        alignToOrigin: true,
                        showTransactionBoundaries: true,
                        // "light" avoids the "automatic" path that probes VS Code theme classes.
                        colorTheme: "light",
                    },
                }),
            );
        })
        .on("GetPropertiesPanelStateCommand", (_m: Command, editorId: string) => {
            store.postMessage(editorId, query("PropertiesPanelStateQuery", { visible: true }));
        })
        .on("GetClipboardCommand", (_m: Command, editorId: string) => {
            store.postMessage(editorId, query("ClipboardQuery", { text: "" }));
        })
        .on("GetTextClipboardCommand", (_m: Command, editorId: string) => {
            store.postMessage(editorId, query("TextClipboardQuery", { text: "" }));
        });

    rpc.on("session/register", async (params: RegisterParams) => {
        mirror.register(params, params.content);
        const handle = new RpcEditorHandle(params, mirror, rpc);
        handles.set(params.editorId, handle);

        // Same wiring the VS Code controller does: route incoming webview
        // messages through the store into the router, and arm the echo-prevention
        // session.
        store.register(handle);
        store.subscribeToMessageEvent(params.editorId, (message, editorId) =>
            router.dispatch(message, editorId),
        );
        bpmnService.registerSession(params.editorId);

        // Seed discovery with the host's authoritative root, then arm the live-
        // reload watcher (the production `ArtifactService` wiring, reused verbatim).
        if (params.workspaceRoot) {
            nodeWorkspace.registerRoot(params.workspaceRoot);
        }
        const { disposables } = await artifactSvc.createWatcher(params.editorId, templatesSvc);
        watchers.set(params.editorId, disposables);

        log(`session registered: ${params.editorId}`);
    });

    rpc.on("webview/message", (params: { editorId: string; message: Command }) => {
        handles.get(params.editorId)?.receive(params.message);
    });

    rpc.on("document/didChange", (params: { editorId: string; content: string }) => {
        mirror.setContent(params.editorId, params.content);
    });

    rpc.on("session/dispose", (params: { editorId: string }) => {
        bpmnService.disposeSession(params.editorId);
        watchers.get(params.editorId)?.forEach((d) => d.dispose());
        watchers.delete(params.editorId);
        // Read the root before removing the mirror entry that holds it.
        const workspaceRoot = mirror.peek(params.editorId)?.workspaceRoot;
        if (workspaceRoot) {
            nodeWorkspace.unregisterRoot(workspaceRoot);
        }
        handles.get(params.editorId)?.dispose();
        handles.delete(params.editorId);
        mirror.remove(params.editorId);
        log(`session disposed: ${params.editorId}`);
    });

    return { rpc };
}
