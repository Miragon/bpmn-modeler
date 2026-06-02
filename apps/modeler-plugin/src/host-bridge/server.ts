/**
 * Out-of-process modeler core: a Node JSON-RPC server that runs the **real**,
 * unmodified BPMN core (`EditorSessionStore` + `BpmnModelerService` +
 * `WebviewMessageRouter`) and exposes it to a non-VS-Code host (the IntelliJ
 * plugin) over stdio.
 *
 * This is the spike's whole point: prove that the TypeScript core can drive a
 * remote host without being rewritten, so the only per-host maintenance surface
 * is the thin set of port adapters. The host implements the ports as RPC
 * handlers; the core never knows it isn't talking to VS Code.
 *
 * Protocol (see {@link Rpc} for framing):
 *   Host → Core (notifications): session/register, webview/message,
 *                                document/didChange, session/dispose
 *   Core → Host (requests):      document/write, document/save
 *   Core → Host (notifications): editor/postMessage, notifier/log,
 *                                statusBar/showEngineVersion
 *
 * stdout is the RPC channel and must carry nothing else; all diagnostics go to
 * stderr (the host pipes that into the IDE log).
 */

import { Command, DiffOrigin, Query, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { DiffSession } from "../diff/domain/DiffSession";
import { DiffPaneStore } from "../diff/infrastructure/DiffPaneStore";
import { BpmnDiffService } from "../diff/service/BpmnDiffService";
import { BpmnElementTemplatesService } from "../modeler/bpmn/service/BpmnElementTemplatesService";
import { BpmnModelerService } from "../modeler/bpmn/service/BpmnModelerService";
import { EditorSessionStore } from "../shared/infrastructure/EditorSessionStore";
import { WebviewMessageRouter } from "../shared/infrastructure/WebviewMessageRouter";
import { ArtifactService } from "../shared/service/ArtifactService";
import {
    DocumentMirror,
    RpcDocumentPort,
    RpcEditorHandle,
    SessionMeta,
    StubNotifier,
    StubPicker,
    StubStatusBar,
} from "./adapters";
import { RpcDiffPaneHandle, dispatchDiffMessage } from "./diffAdapters";
import { NodeSettings, NodeWorkspace } from "./nodeAdapters";
import { Rpc } from "./rpc";

/** Builds a typed-but-stub host reply. The webview only reads `.type`, so a plain object is enough. */
function query(type: string, fields: Record<string, unknown>): Query {
    return { type, ...fields } as unknown as Query;
}

const rpc = new Rpc((line) => process.stdout.write(line + "\n"));

const mirror = new DocumentMirror();
const notifier = new StubNotifier(rpc);
const picker = new StubPicker();
const statusBar = new StubStatusBar(rpc);
const documentPort = new RpcDocumentPort(rpc, mirror);

// onOpenCountChanged is the VS Code setContext hook; irrelevant out-of-process.
const store = new EditorSessionStore(() => {});
const bpmnService = new BpmnModelerService(store, documentPort, picker, statusBar, notifier);

// The element-templates pipeline is the *real* production stack: the only new
// code is the two pure-fs port adapters below. This proves filesystem-backed
// features need no Kotlin beyond the host supplying the workspace root.
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

// The diff feature reuses the production diff brain verbatim: the same store
// and service VS Code wires up, driven here by host-originated `diff/*` RPC
// instead of `vscode.diff` + custom-editor resolution.
const diffStore = new DiffPaneStore();
const diffService = new BpmnDiffService(notifier, nodeSettings, diffStore);

const handles = new Map<string, RpcEditorHandle>();
const watchers = new Map<string, { dispose(): void }[]>();

// Inbound `diff/webviewMessage` carries only `paneUri`; this routes it back to
// the handle that owns that pane's content cache.
const diffPanes = new Map<string, RpcDiffPaneHandle>();
// `diff/dispose` carries only `diffId`; remember each session's panes so we can
// detach + drop them without re-deriving the URIs.
const diffSessions = new Map<string, DiffSession>();

/**
 * The real webview-message dispatch table. The two file/sync handlers call the
 * genuine service; the remaining handshake replies are bridge-level stubs
 * because their real services (element templates, settings, properties panel)
 * pull in workspace/settings adapters that are out of scope for the spike. They
 * must still answer, or the webview's `Promise.all` over templates+settings+
 * panel-state never resolves and bootstrap stalls.
 */
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
    // Inlined rather than importing `getElementTemplatesHandler`, whose module
    // pulls in `VsCodeNotifier` → `vscode`, which the bridge bundle must avoid.
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

interface RegisterParams extends SessionMeta {
    content: string;
}

rpc.on("session/register", async (params: RegisterParams) => {
    mirror.register(params, params.content);
    const handle = new RpcEditorHandle(params, mirror, rpc);
    handles.set(params.editorId, handle);

    // Same wiring the VS Code controller does: route incoming webview messages
    // through the store into the router, and arm the echo-prevention session.
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

    process.stderr.write(`[core] session registered: ${params.editorId}\n`);
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
    process.stderr.write(`[core] session disposed: ${params.editorId}\n`);
});

interface DiffPaneInput {
    uri: string;
    content: string;
}

interface DiffOpenParams {
    diffId: string;
    origin: DiffOrigin;
    before: DiffPaneInput;
    after: DiffPaneInput;
}

/**
 * Host-originated diff start. Unlike VS Code — where the two panes resolve
 * independently and the controller has to pair them — IntelliJ hands us both
 * sides up front, so we build the fully-armed session in one shot: two handles
 * seeded with cached XML, both attached, indexed. Each pane's webview then
 * boots, asks for its file, reports ready, and `markReady` runs the differ once
 * both sides are in.
 */
rpc.on("diff/open", (params: DiffOpenParams) => {
    const beforeHandle = new RpcDiffPaneHandle(params.before.uri, params.before.content, rpc);
    const afterHandle = new RpcDiffPaneHandle(params.after.uri, params.after.content, rpc);

    // Sides are already assigned by the host (it knows HEAD vs working tree),
    // so both factories reduce to "before = left, after = right" here; pick by
    // origin only so the legend's origin-specific chrome stays correct.
    const session =
        params.origin === "scm"
            ? DiffSession.forScm(beforeHandle, afterHandle)
            : DiffSession.forCompareFiles(params.before.uri, params.after.uri);
    session.attachPane(beforeHandle);
    session.attachPane(afterHandle);
    diffStore.index(session);

    diffPanes.set(beforeHandle.uri, beforeHandle);
    diffPanes.set(afterHandle.uri, afterHandle);
    diffSessions.set(params.diffId, session);

    process.stderr.write(`[core] diff opened: ${params.diffId} (${params.origin})\n`);
});

rpc.on("diff/webviewMessage", (params: { paneUri: string; message: Command }) => {
    const handle = diffPanes.get(params.paneUri);
    if (handle) {
        void dispatchDiffMessage(diffService, handle, params.message);
    }
});

rpc.on("diff/dispose", (params: { diffId: string }) => {
    const session = diffSessions.get(params.diffId);
    if (!session) {
        return;
    }
    for (const pane of session.attachedPanes()) {
        diffPanes.delete(pane.uri);
        session.detachPane(pane);
        pane.dispose();
    }
    diffStore.remove(session);
    diffSessions.delete(params.diffId);
    process.stderr.write(`[core] diff disposed: ${params.diffId}\n`);
});

// Read stdin as newline-delimited JSON frames.
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        void rpc.handleLine(line).catch((error: unknown) => {
            process.stderr.write(
                `[core] handler error: ${error instanceof Error ? error.message : String(error)}\n`,
            );
        });
        newline = buffer.indexOf("\n");
    }
});
process.stdin.on("end", () => process.exit(0));

process.stderr.write("[core] modeler-core bridge ready\n");
