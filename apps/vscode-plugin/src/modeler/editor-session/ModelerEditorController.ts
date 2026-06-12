import {
    CancellationToken,
    CustomTextEditorProvider,
    ExtensionContext,
    TextDocument,
    WebviewPanel,
    window,
} from "vscode";

import { Command } from "@miragon/bpmn-modeler-shared";

import { DocumentChangeEvent, EditorSubscription, SettingChange } from "@miragon/bpmn-modeler-core";
import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { VsCodeEditorHandle } from "../../shared/infrastructure/VsCodeEditorHandle";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { WebviewMessageRouter } from "@miragon/bpmn-modeler-core";
import { EditorSessionContext, EditorSessionParticipant } from "./EditorSessionParticipant";

/**
 * Per-`viewType` configuration for {@link ModelerEditorController}. Everything
 * that differs between the BPMN and DMN editors is data here, so one controller
 * class serves both.
 */
export interface ModelerEditorOptions {
    viewType: string;
    messageRouter: WebviewMessageRouter;
    participants: readonly EditorSessionParticipant[];

    /**
     * BPMN-only diff routing. Returning `true` means this resolve was handled
     * elsewhere (a diff pane), so the editor session must not be created.
     */
    delegateResolve?: (document: TextDocument, panel: WebviewPanel) => boolean;

    /** Persisted properties-panel visibility, pre-applied to the HTML (BPMN & DMN). */
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
            this.editorStore.register(
                VsCodeEditorHandle.create(
                    this.options.viewType,
                    editorId,
                    webviewPanel,
                    document,
                    this.options.initialPanelVisible?.(),
                ),
            );

            const context = new EditorSessionContextImpl(this.editorStore, editorId, webviewPanel);

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
            this.editorStore.subscribeToDisposeEvent(editorId, () => context.runDisposeCallbacks());

            // Isolate each participant: a throw in one must not skip the rest.
            // ElementTemplatesParticipant awaits a workspace-root lookup that
            // rethrows on a missing git root, and a single outer catch would then
            // drop every later participant — no settings broadcast, no engine
            // status bar, and (worst) the inline-script teardown never registers,
            // leaking on editor close. Order-independent and future-proof.
            for (const participant of this.options.participants) {
                try {
                    await participant.onResolve(context);
                } catch (error) {
                    this.notifier.showError((error as Error).message);
                    this.notifier.logError(error as Error);
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
            this.notifier.logInfo(`Message received -> ${message.type}`);
            try {
                await this.options.messageRouter.dispatch(message, id);
                this.notifier.logInfo(`Message processed -> ${message.type}`);
            } catch (error) {
                // VS Code's event emitter does not await this async listener, so
                // a rejected dispatch would otherwise surface as an unhandled
                // promise rejection. Log it — one handler's failure must never
                // crash the host.
                this.notifier.logError(error as Error);
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

    constructor(
        private readonly editorStore: EditorSessionStore,
        readonly editorId: string,
        readonly panel: WebviewPanel,
    ) {}

    onDocumentChange(callback: (event: DocumentChangeEvent) => void): void {
        this.editorStore.subscribeToDocumentChangeEvent(this.editorId, callback);
    }

    onSettingChange(callback: (event: SettingChange, editorId: string) => void): void {
        this.editorStore.subscribeToSettingChangeEvent(this.editorId, callback);
    }

    onDispose(callback: () => void): void {
        this.disposeCallbacks.push(callback);
    }

    addDisposable(disposable: EditorSubscription): void {
        this.editorStore.addToDisposals(this.editorId, disposable);
    }

    /** Runs the collected teardown callbacks in registration order. */
    runDisposeCallbacks(): void {
        for (const callback of this.disposeCallbacks) {
            callback();
        }
    }
}
