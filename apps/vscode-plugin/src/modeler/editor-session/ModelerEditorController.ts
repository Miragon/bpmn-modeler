import {
    CancellationToken,
    CustomTextEditorProvider,
    ExtensionContext,
    TextDocument,
    WebviewPanel,
    window,
} from "vscode";

import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { DocumentChangeEvent, EditorSubscription, SettingChange } from "@miragon/bpmn-modeler-core";
import { basenameOfUriString, EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { VsCodeEditorHandle } from "../../shared/infrastructure/VsCodeEditorHandle";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { WebviewMessageRouter } from "@miragon/bpmn-modeler-core";
import { EditorSessionContext, EditorSessionParticipant } from "./EditorSessionParticipant";

const ORDERED_DOCUMENT_MESSAGES = new Set(["SyncDocumentCommand"]);

/**
 * Per-`viewType` configuration for {@link ModelerEditorController}. Everything
 * that differs between the modeler editors is data here, so one controller
 * class serves all of them.
 */
export interface ModelerEditorOptions {
    viewType: string;
    messageRouter: WebviewMessageRouter;
    participants: readonly EditorSessionParticipant[];

    /**
     * Optional diff routing. Returning `true` means this resolve was handled
     * elsewhere (a diff pane), so the editor session must not be created.
     */
    delegateResolve?: (document: TextDocument, panel: WebviewPanel) => boolean;

    /** Persisted properties-panel visibility, pre-applied where supported. */
    initialPanelVisible?: () => boolean;
}

/**
 * Generic `CustomTextEditorProvider` for the modeler editors.
 *
 * Constant-size as features grow: it no longer hand-wires each feature's
 * session setup. `resolveCustomTextEditor` reduces to URI routing → create
 * session → run participants → dispatch. Each lifecycle concern lives in an
 * {@link EditorSessionParticipant}; this controller only owns the parts that are
 * the same for every modeler — message dispatch, tab tracking, and the single
 * aggregated dispose.
 */
export class ModelerEditorController implements CustomTextEditorProvider {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: VsCodeNotifier,
        private readonly options: ModelerEditorOptions,
    ) {}

    /**
     * Registers this provider as the custom editor for its `viewType` and adds
     * the resulting disposable to the extension context.
     *
     * Webview context is intentionally not retained on hide; the webview
     * re-fetches the document on reload and `WebviewStateManager` round-trips
     * viewport / selection / panel state through `vscode.setState`.
     */
    register(context: ExtensionContext): void {
        const provider = window.registerCustomEditorProvider(this.options.viewType, this);
        context.subscriptions.push(provider);
    }

    /**
     * Called by VS Code whenever a matching file is opened.
     *
     * Order matters and preserves the former controllers' semantics: the diff
     * branch short-circuits before any session is created; message/tab/dispose
     * subscriptions are wired synchronously before any participant runs (a
     * participant may await, and the webview is already loading); the single
     * dispose subscription runs every participant's teardown once, after the
     * store's own bookkeeping.
     */
    async resolveCustomTextEditor(
        document: TextDocument,
        webviewPanel: WebviewPanel,
        _token: CancellationToken,
    ): Promise<void> {
        try {
            // Diff branch (BPMN only): the diff controller owns this pane, so no
            // editor session is created. One provider per viewType makes the
            // entry point the only place that can decide diff-pane vs. editor.
            if (this.options.delegateResolve?.(document, webviewPanel)) {
                return;
            }

            const editorId = document.uri.toString();
            const editorHandle = VsCodeEditorHandle.create(
                this.options.viewType,
                editorId,
                webviewPanel,
                document,
                this.options.initialPanelVisible?.(),
            );
            this.editorStore.register(editorHandle);
            // Reproduction breadcrumb: the open/close pair frames a session in the
            // channel so a bug report reads as a sequence of user steps.
            this.notifier.logInfo(
                `Editor opened: ${basenameOfUriString(editorId)} (${this.options.viewType})`,
            );

            const context = new EditorSessionContextImpl(
                this.editorStore,
                editorHandle,
                editorId,
                webviewPanel,
            );

            // Wire message/tab/dispose synchronously, before running any
            // participant. `register` set the webview HTML, so the webview is
            // already loading and posts its first message (e.g. GetBpmnFileCommand)
            // on load; a participant may then `await` (ElementTemplatesParticipant
            // does a filesystem lookup), so attaching the listener after the loop
            // would open a window where that first message arrives unobserved.
            // Participant order still matters for behaviour: the render
            // participant must run first so the diagram is mounted before later
            // participants broadcast settings/engine state against it.
            this.subscribeToMessageEvent(editorId);
            this.editorStore.subscribeToTabChangeEvent(editorId);
            // Single dispose subscription, not one per participant: a second
            // `onDidDispose` listener would fire `disposeEditor` (map delete +
            // open-count) once per participant. Aggregating teardown here keeps
            // it a single call, after the store's own bookkeeping. Wired before
            // the loop (the callbacks are read lazily) so an immediate close
            // during a participant's await is still cleaned up.
            this.editorStore.subscribeToDisposeEvent(editorId, () => {
                this.notifier.logInfo(
                    `Editor closed: ${basenameOfUriString(editorId)} (${this.options.viewType})`,
                );
                context.runDisposeCallbacks();
            });

            // Isolate each participant: a throw in one must not skip the rest.
            // ElementTemplatesParticipant awaits a workspace-root lookup that
            // rethrows on a missing git root, and a single outer catch would then
            // drop every later participant — no settings broadcast, no engine
            // status bar, and (worst) the inline-script teardown never registers,
            // leaking on editor close. Order-independent and future-proof.
            for (const participant of this.options.participants) {
                if (!context.isCurrent()) break;
                try {
                    await participant.onResolve(context);
                } catch (error) {
                    if (context.isCurrent()) {
                        this.notifier.showError((error as Error).message);
                        this.notifier.logError(error as Error);
                    }
                }
            }
        } catch (error) {
            this.notifier.showError((error as Error).message);
            this.notifier.logError(error as Error);
        }
    }

    /**
     * Forwards incoming webview messages to the {@link WebviewMessageRouter}.
     *
     * The router's handlers (wired in `main.ts`) own the transport → service
     * translation; this method only brackets dispatch with the received/processed
     * log lines that the output channel relies on.
     */
    private subscribeToMessageEvent(editorId: string): void {
        this.editorStore.subscribeToMessageEvent(editorId, async (message: Command, id: string) => {
            const session = this.editorStore.captureEditorSession(id);
            if (!session) return;
            const dispatch = async (): Promise<void> => {
                // Per-message transport tracing: useful when diagnosing a stuck
                // webview handshake, but far too frequent for the default level.
                this.notifier.logDebug(`Message received -> ${message.type}`);
                try {
                    await this.options.messageRouter.dispatch(message, id);
                    this.notifier.logDebug(`Message processed -> ${message.type}`);
                } catch (error) {
                    // VS Code's event emitter does not await this async listener, so
                    // a rejected dispatch would otherwise surface as an unhandled
                    // promise rejection. Log it — one handler's failure must never
                    // crash the host.
                    this.notifier.logError(error as Error);
                }
            };

            if (ORDERED_DOCUMENT_MESSAGES.has(message.type)) {
                const sync = message as SyncDocumentCommand;
                if (!this.editorStore.isHostDocumentRevisionCurrent(id, sync.documentRevision)) {
                    return;
                }
                await this.editorStore.runInEditorQueue(id, async () => {
                    await dispatch();
                    if (this.editorStore.isHostDocumentRevisionCurrent(id, sync.documentRevision)) {
                        this.editorStore.recordDocumentSync(id, session, sync.content);
                    }
                });
            } else {
                await dispatch();
            }
        });
    }
}

/**
 * Concrete {@link EditorSessionContext} backed by the {@link EditorSessionStore}.
 *
 * Collects participants' `onDispose` callbacks rather than wiring each to its
 * own store dispose subscription; {@link runDisposeCallbacks} is invoked once by
 * the controller's single dispose handler.
 */
class EditorSessionContextImpl implements EditorSessionContext {
    private readonly disposeCallbacks: (() => void)[] = [];
    private disposed = false;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly session: object,
        readonly editorId: string,
        readonly panel: WebviewPanel,
    ) {}

    onDocumentChange(callback: (event: DocumentChangeEvent) => void): void {
        if (!this.isCurrent()) return;
        this.editorStore.subscribeToDocumentChangeEvent(this.editorId, callback);
    }

    onSettingChange(callback: (event: SettingChange, editorId: string) => void): void {
        if (!this.isCurrent()) return;
        this.editorStore.subscribeToSettingChangeEvent(this.editorId, callback);
    }

    onDispose(callback: () => void): void {
        if (this.disposed || !this.isCurrent()) {
            callback();
            return;
        }
        this.disposeCallbacks.push(callback);
    }

    addDisposable(disposable: EditorSubscription): void {
        if (!this.isCurrent()) {
            disposable.dispose();
            return;
        }
        this.editorStore.addToDisposals(this.editorId, disposable);
    }

    isCurrent(): boolean {
        return (
            !this.disposed && this.editorStore.isCurrentEditorSession(this.editorId, this.session)
        );
    }

    /** Runs the collected teardown callbacks in registration order. */
    runDisposeCallbacks(): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const callback of this.disposeCallbacks.splice(0)) {
            callback();
        }
    }
}
