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
 *   Core → Host (requests):      document/write, document/save, picker/show
 *   Core → Host (notifications): editor/postMessage, notifier/*, statusBar/*
 *
 * Diff, DMN, and deployment are deliberately out of scope here — they are their
 * own follow-up issues (#1067–#1069+); this is the BPMN-editor foundation.
 */

import {
    Command,
    Query,
    SetClipboardCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";
import {
    ArtifactService,
    BpmnClipboardMediator,
    BpmnElementTemplatesService,
    BpmnModelerService,
    BpmnSettingsBroadcaster,
    EditorSessionStore,
    WebviewMessageRouter,
} from "@miragon/bpmn-modeler-core";

import {
    DocumentMirror,
    RpcClipboard,
    RpcDocumentPort,
    RpcEditorHandle,
    RpcNotifier,
    RpcPicker,
    RpcStatusBar,
    SessionMeta,
} from "./adapters";
import { BridgeSettings, NodeWorkspace, SettingsSnapshot } from "./nodeAdapters";
import { Rpc } from "./rpc";

/** Builds a typed-but-stub host reply. The webview only reads `.type`, so a plain object is enough. */
function query(type: string, fields: Record<string, unknown>): Query {
    return { type, ...fields } as unknown as Query;
}

interface RegisterParams extends SessionMeta {
    content: string;
    /** Full `miragon.bpmnModeler.*` snapshot; seeds settings before template discovery. */
    settings?: Partial<SettingsSnapshot>;
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
    const statusBar = new RpcStatusBar(rpc);
    const documentPort = new RpcDocumentPort(rpc, mirror);

    // The element-templates pipeline is the *real* production stack: the only new
    // code is the two pure-fs/host-fed port adapters (NodeWorkspace/BridgeSettings).
    // This is what makes the status-bar template count genuine rather than a placeholder.
    const nodeWorkspace = new NodeWorkspace();
    const settings = new BridgeSettings();

    // The picker reuses NodeWorkspace for its one filesystem-backed prompt
    // (pickWorkspaceFiles); every other prompt receives its candidates inline.
    const picker = new RpcPicker(rpc, nodeWorkspace);

    // onOpenCountChanged is the VS Code setContext hook; irrelevant out-of-process.
    const store = new EditorSessionStore(() => {});
    const bpmnService = new BpmnModelerService(store, documentPort, picker, statusBar, notifier);
    const artifactSvc = new ArtifactService(nodeWorkspace, settings);
    const templatesSvc = new BpmnElementTemplatesService(
        store,
        documentPort,
        artifactSvc,
        statusBar,
        notifier,
    );

    // The same broadcaster the VS Code host uses: on a settings change it re-pushes
    // modeler settings + language to the webview. It is `vscode`-free, so it runs
    // here unmodified — the only difference is the change events come from the
    // host's RPC snapshots rather than `workspace.onDidChangeConfiguration`.
    const settingsBroadcaster = new BpmnSettingsBroadcaster(store, settings, notifier);

    // Real clipboard mediator (sandboxed-iframe pattern): the host reads/writes
    // the system clipboard on the webview's behalf over RPC.
    const clipboard = new RpcClipboard(rpc);
    const clipboardMediator = new BpmnClipboardMediator(store, clipboard, notifier);

    const handles = new Map<string, RpcEditorHandle>();
    const watchers = new Map<string, { dispose(): void }[]>();

    // The real webview-message dispatch table. The file/sync/settings/templates/
    // clipboard handlers call the genuine services; the remaining handshake reply
    // is a bridge-level stub because its real service (properties panel) pulls in a
    // host port that is a later issue (#1065). It must still answer, or the
    // webview's `Promise.all` over templates+settings+panel-state never resolves
    // and bootstrap stalls.
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
        // The webview re-requests settings on every (re)load; push the live snapshot
        // and language, mirroring the VS Code `getBpmnModelerSettingHandler`.
        .on("GetBpmnModelerSettingCommand", (_m: Command, editorId: string) => {
            void settingsBroadcaster.setSettings(editorId);
            settingsBroadcaster.setLanguage(editorId);
        })
        .on("GetPropertiesPanelStateCommand", (_m: Command, editorId: string) => {
            store.postMessage(editorId, query("PropertiesPanelStateQuery", { visible: true }));
        })
        .on("GetClipboardCommand", (_m: Command, editorId: string) => {
            void clipboardMediator.readClipboard(editorId);
        })
        .on("SetClipboardCommand", (message: Command) => {
            void clipboardMediator.writeClipboard((message as SetClipboardCommand).text);
        })
        .on("GetTextClipboardCommand", (_m: Command, editorId: string) => {
            void clipboardMediator.readTextClipboard(editorId);
        })
        .on("SetTextClipboardCommand", (message: Command) => {
            void clipboardMediator.writeClipboard((message as SetTextClipboardCommand).text);
        });

    rpc.on("session/register", async (params: RegisterParams) => {
        // Seed settings before any discovery so `getConfigFolder()` is correct on
        // the first template scan/watcher. Snapshots are host-global; applying the
        // same one on each register is idempotent.
        if (params.settings) {
            settings.apply(params.settings);
        }

        mirror.register(params, params.content);
        const handle = new RpcEditorHandle(params, mirror, rpc, settings);
        handles.set(params.editorId, handle);

        // Same wiring the VS Code controller does: route incoming webview
        // messages through the store into the router, and arm the echo-prevention
        // session.
        store.register(handle);
        store.subscribeToMessageEvent(params.editorId, (message, editorId) =>
            router.dispatch(message, editorId),
        );
        bpmnService.registerSession(params.editorId);

        // Mirrors SettingsParticipant + ElementTemplatesParticipant: re-push
        // modeler/language settings on change, and reload templates when the
        // config folder moves. Both ride the BridgeSettings change hub via the
        // handle's onDidChangeSetting; disposed with the session by the store.
        settingsBroadcaster.subscribe(params.editorId);
        store.subscribeToSettingChangeEvent(params.editorId, (event, editorId) => {
            if (event.affectsConfiguration("miragon.bpmnModeler.configFolder")) {
                void templatesSvc.setElementTemplates(editorId);
            }
        });

        // Seed discovery with the host's authoritative root, then arm the live-
        // reload watcher (the production `ArtifactService` wiring, reused verbatim).
        if (params.workspaceRoot) {
            nodeWorkspace.registerRoot(params.workspaceRoot);
        }
        const { disposables } = await artifactSvc.createWatcher(params.editorId, templatesSvc);
        watchers.set(params.editorId, disposables);

        log(`session registered: ${params.editorId}`);
    });

    // One host frame updates every open editor: `apply` fires a SettingChange that
    // each session's broadcaster + configFolder listener turn into webview pushes.
    rpc.on("settings/didChange", (params: { settings: Partial<SettingsSnapshot> }) => {
        settings.apply(params.settings);
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
