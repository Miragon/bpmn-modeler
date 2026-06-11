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
 *                                document/didChange, settings/didChange,
 *                                session/setActive, session/dispose,
 *                                diff/open, diff/webviewMessage, diff/dispose,
 *                                deploymentState/seed, deployment/webviewMessage,
 *                                deployment/open, script/didChange, script/didClose
 *   Core → Host (requests):      document/write, document/save, picker/show,
 *                                secretStore/*
 *   Core → Host (notifications): editor/postMessage, diff/postMessage,
 *                                deployment/postMessage, deploymentState/save*,
 *                                notifier/*, statusBar/*, script/open, script/close,
 *                                script/updateVariables
 *
 * DMN is deliberately out of scope here — it has no IntelliJ editor yet; this
 * covers the BPMN editor, diff and deployment. The
 * diff path reuses the production diff brain verbatim (`DiffPaneStore` +
 * `BpmnDiffService` + `bpmn-js-differ`), driven by host-originated `diff/*` RPC
 * instead of VS Code's `vscode.diff` + custom-editor resolution.
 */

import {
    Command,
    DiffOrigin,
    ImplementationKind,
    NavigateToImplementationCommand,
    NavigateToReferencedModelCommand,
    OpenScriptEditorCommand,
    Query,
    SetClipboardCommand,
    SetTextClipboardCommand,
    SyncActivitiesCommand,
    SyncDocumentCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";
import {
    ArtifactService,
    AuthHeaderResolver,
    BpmnClipboardMediator,
    BpmnDiffService,
    BpmnElementTemplatesService,
    BpmnModelerService,
    BpmnSettingsBroadcaster,
    Camunda7RestClient,
    Camunda8RestClient,
    CamundaEngineRouter,
    CodeLinkMapService,
    DeploymentMessageDispatcher,
    DeploymentService,
    DiffPaneStore,
    DiffSession,
    EditorSessionStore,
    FetchHttpClient,
    ImplementationLocator,
    ImplementationNavigationService,
    ModelNavigationService,
    ReferencedModelLocator,
    StartInstanceService,
    WebviewMessageRouter,
} from "@miragon/bpmn-modeler-core";

import {
    DeploymentStateSnapshot,
    DocumentMirror,
    RpcClipboard,
    RpcDeploymentState,
    RpcDocumentPort,
    RpcEditorHandle,
    RpcNotifier,
    RpcPicker,
    RpcSecretStore,
    RpcStatusBar,
    SessionMeta,
} from "./adapters";
import { RpcDiffPaneHandle, dispatchDiffMessage } from "./diffAdapters";
import { BridgeSettings, NodeWorkspace, SettingsSnapshot } from "./nodeAdapters";
import { Rpc } from "./rpc";
import { BridgeScriptEditor } from "./scriptAdapters";

/** Builds a typed-but-stub host reply. The webview only reads `.type`, so a plain object is enough. */
function query(type: string, fields: Record<string, unknown>): Query {
    return { type, ...fields } as unknown as Query;
}

/** Implementation kinds the locator can resolve; a guard against a malformed webview message. */
const KNOWN_IMPLEMENTATION_KINDS: ReadonlySet<ImplementationKind> = new Set<ImplementationKind>([
    "javaClass",
    "delegateExpression",
    "expression",
    "externalTopic",
    "jobType",
]);

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

    // The diff feature reuses the production diff brain verbatim: the same store
    // and service VS Code wires up. `settings` supplies the locale; diff panes are
    // not editor sessions, so they don't ride the per-session settings hub — the
    // locale is pushed on open via the service's `markReady` and re-pushed on
    // `settings/didChange` via `rebroadcastLanguage` (see the handler below).
    const diffStore = new DiffPaneStore();
    const diffService = new BpmnDiffService(notifier, settings, diffStore);

    // The model-navigation brain is `vscode`-free, so it runs unmodified here:
    // the locator searches via NodeWorkspace's findFiles/readFile/readDirectory,
    // and the service surfaces results through the same notifier/picker the host
    // already implements over RPC (notifier/openDocument + picker/show).
    const referencedModelLocator = new ReferencedModelLocator(nodeWorkspace, notifier);
    const modelNavigationService = new ModelNavigationService(
        referencedModelLocator,
        notifier,
        picker,
    );

    // The code-link brain is `vscode`-free too: the locator/navigation service
    // mirror the model-navigation pair (search via NodeWorkspace, surface via the
    // RPC notifier/picker), while the always-on map service maintains context-pad
    // visibility and live linking off the source-file watcher. Mirrors
    // `composition/codeLinkFeature.ts` — the locator is shared by both consumers.
    const implementationLocator = new ImplementationLocator(nodeWorkspace, notifier);
    const implementationNavigationService = new ImplementationNavigationService(
        implementationLocator,
        notifier,
        picker,
    );
    const codeLinkMapService = new CodeLinkMapService(
        store,
        implementationLocator,
        artifactSvc,
        nodeWorkspace,
        settings,
        notifier,
    );

    // "Edit Script" orchestrator. Unlike the other features this one has no
    // in-core service — the VS Code original was never extracted (its guts are
    // VS Code-specific accidental complexity) — so the portable slice lives here
    // and the Kotlin host is a dumb editor surface keyed by an opaque scriptId.
    const scriptEditor = new BridgeScriptEditor(store, picker, rpc, notifier);

    // Deployment reuses the production deployment brain verbatim: the same
    // services + dispatcher the VS Code host wires, now fed by the host-fed
    // deployment-state mirror and the PasswordSafe-backed secret store over RPC.
    // The Camunda REST stack is pure Node (Buffer/fetch/multipart), so it runs
    // unmodified under Bun. `post` notifies the host, which pushes the Query into
    // the deployment tool-window's JCEF browser.
    const httpClient = new FetchHttpClient();
    const authResolver = new AuthHeaderResolver(httpClient);
    const camundaRouter = new CamundaEngineRouter(
        new Camunda7RestClient(httpClient, authResolver),
        new Camunda8RestClient(httpClient, authResolver, settings.getC8ApiVersion()),
    );
    const deploymentState = new RpcDeploymentState(rpc);
    const secretStore = new RpcSecretStore(rpc);
    const deploymentService = new DeploymentService(
        documentPort,
        nodeWorkspace,
        deploymentState,
        camundaRouter,
        notifier,
        picker,
        secretStore,
    );
    const startInstanceService = new StartInstanceService(
        documentPort,
        nodeWorkspace,
        camundaRouter,
        notifier,
        picker,
        artifactSvc,
    );
    const deploymentDispatcher = new DeploymentMessageDispatcher(
        store,
        documentPort,
        deploymentService,
        startInstanceService,
        notifier,
        (message) => rpc.notify("deployment/postMessage", { message }),
    );

    // The form's defaults track the active editor, but only while the panel is
    // open — refreshing a hidden panel would be wasted RPC. The host reports
    // open/close via `deployment/open`.
    let deploymentPanelOpen = false;
    store.onDidChangeActiveEditor(() => {
        if (deploymentPanelOpen) {
            deploymentDispatcher.sendFormDefaults();
        }
    });

    const handles = new Map<string, RpcEditorHandle>();
    const watchers = new Map<string, { dispose(): void }[]>();

    // Diff panes route by `paneUri` (a diff has two browsers, indexed
    // independently of editor sessions); `diffSessions` maps each `diffId` to
    // its session so `diff/dispose` can detach and drop both panes at once.
    const diffPanes = new Map<string, RpcDiffPaneHandle>();
    const diffSessions = new Map<string, DiffSession>();

    // The real webview-message dispatch table. The file/sync/settings/templates/
    // clipboard/navigation handlers call the genuine services; the remaining
    // handshake reply is a bridge-level stub because its real service (properties
    // panel) is not wired on this host path. It must still answer, or the
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
        })
        // Mirrors `navigateToReferencedModelHandler` on the VS Code host: an
        // unknown discriminant is rejected with a warning rather than falling
        // through to "decision" by default — defence in depth against a
        // malformed webview message ever opening the wrong kind of file.
        .on("NavigateToReferencedModelCommand", async (message: Command, editorId: string) => {
            const cmd = message as NavigateToReferencedModelCommand;
            if (cmd.referenceKind !== "process" && cmd.referenceKind !== "decision") {
                notifier.logWarning(
                    `Ignoring NavigateToReferencedModelCommand with unknown kind: ${String(
                        cmd.referenceKind,
                    )}`,
                );
                return;
            }
            const sourceFsPath = store.requireHandle(editorId).documentFsPath();
            await modelNavigationService.navigate(cmd.referenceId, cmd.referenceKind, sourceFsPath);
        })
        // Mirrors `navigateToImplementationHandler` on the VS Code host: the same
        // defence-in-depth guard rejects an unknown/empty `kind` so a malformed
        // message can't be resolved as an arbitrary kind.
        .on("NavigateToImplementationCommand", async (message: Command, editorId: string) => {
            const cmd = message as NavigateToImplementationCommand;
            if (!KNOWN_IMPLEMENTATION_KINDS.has(cmd.kind)) {
                notifier.logWarning(
                    `Ignoring NavigateToImplementationCommand with unknown kind: ${String(
                        cmd.kind,
                    )}`,
                );
                return;
            }
            const sourceFsPath = store.requireHandle(editorId).documentFsPath();
            await implementationNavigationService.navigate(cmd.reference, cmd.kind, sourceFsPath);
        })
        // Always-on activity→code reconciliation; the map service filters invalid
        // entries internally, so this stays a thin pass-through.
        .on("SyncActivitiesCommand", async (message: Command, editorId: string) => {
            await codeLinkMapService.syncActivities(
                editorId,
                (message as SyncActivitiesCommand).entries,
            );
        })
        .on("OpenScriptEditorCommand", (message: Command, editorId: string) => {
            void scriptEditor.open(message as OpenScriptEditorCommand, editorId);
        })
        // Live process-variable model update → push to every open script tab of
        // this editor so completion stays current without reopening.
        .on("UpdateScriptVariablesCommand", (message: Command, editorId: string) => {
            scriptEditor.updateVariables(
                editorId,
                (message as UpdateScriptVariablesCommand).variables,
            );
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
    // Diff panes aren't editor sessions, so they need an explicit locale re-push.
    rpc.on("settings/didChange", (params: { settings: Partial<SettingsSnapshot> }) => {
        settings.apply(params.settings);
        diffService.rebroadcastLanguage();
    });

    rpc.on("webview/message", (params: { editorId: string; message: Command }) => {
        handles.get(params.editorId)?.receive(params.message);
    });

    // External edits (git revert/checkout, the IDE's plain-text tab, another
    // tool) must re-render the open diagram. The host stays dumb and forwards
    // *every* document change — including the echo of our own `document/write` —
    // so the bridge classifies them here: `RpcDocumentPort.write` updates the
    // mirror to the core-originated content before the RPC round-trip, so an
    // unchanged compare means this is that echo and re-rendering would loop.
    // Only a genuinely different text is an external edit worth displaying.
    rpc.on("document/didChange", async (params: { editorId: string; content: string }) => {
        if (mirror.content(params.editorId) === params.content) {
            return;
        }
        mirror.setContent(params.editorId, params.content);
        await bpmnService.display(params.editorId);
    });

    // The host reports which editor tab is focused so the store's active-editor
    // pointer stays correct with several `.bpmn` files open (commands/diff that
    // target "the active editor" depend on it).
    rpc.on("session/setActive", (params: { editorId: string }) => {
        store.setActiveEditor(params.editorId);
    });

    rpc.on("session/dispose", (params: { editorId: string }) => {
        bpmnService.disposeSession(params.editorId);
        // Close any script tabs this editor opened before its handle is dropped.
        scriptEditor.disposeEditor(params.editorId);
        // Release this editor's code-link map state + its share of the source
        // watcher; mirrors `CodeLinkParticipant` (the bridge has no participants).
        codeLinkMapService.disposeEditor(params.editorId);
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

    /**
     * Host-originated diff start. Unlike VS Code — where the two panes resolve
     * independently and the controller has to pair them — IntelliJ hands us both
     * sides up front (it knows HEAD vs working tree), so we build the fully-armed
     * session in one shot: two handles seeded with cached XML, both attached,
     * indexed. Each pane's webview then boots, asks for its file, reports ready,
     * and `markReady` runs the differ once both sides are in. Sides are already
     * assigned by the host, so the `forScm`/`forCompareFiles` choice is made by
     * origin alone — only so the legend's origin-specific chrome stays correct.
     */
    rpc.on("diff/open", (params: DiffOpenParams) => {
        const beforeHandle = new RpcDiffPaneHandle(params.before.uri, params.before.content, rpc);
        const afterHandle = new RpcDiffPaneHandle(params.after.uri, params.after.content, rpc);

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

        log(`diff opened: ${params.diffId} (${params.origin})`);
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
        log(`diff disposed: ${params.diffId}`);
    });

    // The host edited an open script tab → push the new content into the owning
    // BPMN webview, which writes it to the moddle property via bpmn-js.
    rpc.on("script/didChange", (params: { scriptId: string; content: string }) => {
        void scriptEditor.didChange(params.scriptId, params.content);
    });

    // The user closed a script tab on the host → drop tracking so a re-open
    // re-reads the current BPMN content rather than revealing a stale tab.
    rpc.on("script/didClose", (params: { scriptId: string }) => {
        scriptEditor.didClose(params.scriptId);
    });

    // Seed the deployment-state mirror once at startup (and after a persisted
    // save, if the host chooses to re-seed); getters then read it synchronously.
    rpc.on("deploymentState/seed", (params: { state: Partial<DeploymentStateSnapshot> }) => {
        deploymentState.seed(params.state);
    });

    // Inbound deployment-webview message → the shared dispatch core. Errors are
    // caught inside each handler, so this never rejects.
    rpc.on("deployment/webviewMessage", (params: { message: Command }) => {
        void deploymentDispatcher.handle(params.message);
    });

    // The host reports the tool window's visibility; on open, push the current
    // form defaults so the panel reflects the active diagram immediately.
    rpc.on("deployment/open", (params: { open: boolean }) => {
        deploymentPanelOpen = params.open;
        if (params.open) {
            deploymentDispatcher.sendFormDefaults();
        }
    });

    return { rpc };
}

interface DiffPaneInput {
    /** Stable, diff-scoped pane identity (host appends `#<diffId>-<role>`). */
    uri: string;
    content: string;
}

interface DiffOpenParams {
    diffId: string;
    origin: DiffOrigin;
    before: DiffPaneInput;
    after: DiffPaneInput;
}
