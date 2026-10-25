import { Command } from "@miragon/bpmn-modeler-shared";

import { DocumentChangeEvent, EditorSubscription, SettingChange } from "../domain/EditorSession";
import { EditorSessionContext, EditorSessionParticipant } from "../domain/EditorSessionParticipant";
import { LoggerPort, NotifierPort } from "../domain/hostPorts";
import { EditorSessionStore } from "./EditorSessionStore";
import { dispatchInDocumentOrder } from "./orderedDocumentDispatch";
import { WebviewMessageRouter } from "./WebviewMessageRouter";

/**
 * Runs an editor session from open to close, the same way on every host:
 * routes webview messages in document order, tracks focus, runs each
 * participant in isolation, and tears every participant down once on close.
 * A host registers the session's handle in the store, then calls {@link open}.
 */
export class EditorSessionLifecycle {
    private readonly contexts = new Map<string, SessionContext>();

    constructor(
        private readonly store: EditorSessionStore,
        private readonly notifier: NotifierPort,
        private readonly router: WebviewMessageRouter,
        private readonly participants: readonly EditorSessionParticipant[],
    ) {}

    /**
     * Messages, focus and dispose are wired before the first participant runs:
     * the webview is already loading, and a participant may await.
     */
    async open(editorId: string, onClose?: () => void): Promise<void> {
        const handle = this.store.requireHandle(editorId);
        this.routeMessages(editorId);
        this.store.subscribeToTabChangeEvent(editorId);

        const context = new SessionContext(this.store, handle, editorId);
        this.contexts.set(editorId, context);
        this.store.subscribeToDisposeEvent(editorId, () => {
            if (this.contexts.get(editorId) === context) this.contexts.delete(editorId);
            onClose?.();
            context.close();
        });

        for (const participant of this.participants) {
            if (!context.isCurrent()) break;
            await this.isolated(context, () => participant.onResolve(context));
        }
    }

    async reseed(editorId: string): Promise<void> {
        const context = this.contexts.get(editorId);
        if (!context) return;
        for (const callback of context.reseedCallbacks()) {
            if (!context.isCurrent()) break;
            await this.isolated(context, callback);
        }
    }

    /** A throw in one participant must not skip the rest, or later teardowns never register. */
    private async isolated(
        context: SessionContext,
        work: () => void | Promise<void>,
    ): Promise<void> {
        try {
            await work();
        } catch (error) {
            if (context.isCurrent()) {
                this.notifier.showError((error as Error).message);
                this.notifier.logError(error as Error);
            }
        }
    }

    private routeMessages(editorId: string): void {
        this.store.subscribeToMessageEvent(editorId, async (message: Command, id: string) => {
            const session = this.store.captureEditorSession(id);
            if (!session) return;
            try {
                await dispatchInDocumentOrder(this.store, id, session, message, () =>
                    dispatchLogged(this.router, this.notifier, message, id),
                );
            } catch (error) {
                this.notifier.logError(error as Error);
            }
        });
    }
}

async function dispatchLogged(
    router: WebviewMessageRouter,
    logger: LoggerPort,
    message: Command,
    editorId: string,
): Promise<void> {
    logger.logDebug(`Message received -> ${message.type}`);
    try {
        await router.dispatch(message, editorId);
        logger.logDebug(`Message processed -> ${message.type}`);
    } catch (error) {
        // Hosts do not await message listeners; one handler's failure must not
        // surface as an unhandled rejection.
        logger.logError(error as Error);
    }
}

class SessionContext implements EditorSessionContext {
    private readonly disposeCallbacks: (() => void)[] = [];
    private readonly reseeds: (() => void | Promise<void>)[] = [];
    private closed = false;

    constructor(
        private readonly store: EditorSessionStore,
        private readonly session: object,
        readonly editorId: string,
    ) {}

    isCurrent(): boolean {
        return !this.closed && this.store.isCurrentEditorSession(this.editorId, this.session);
    }

    isFocused(): boolean {
        return this.isCurrent() && this.store.requireHandle(this.editorId).isActive();
    }

    onFocusChange(callback: (focused: boolean) => void): void {
        if (!this.isCurrent()) return;
        this.store.subscribeToFocusChangeEvent(this.editorId, callback);
    }

    onDocumentChange(callback: (event: DocumentChangeEvent) => void): void {
        if (!this.isCurrent()) return;
        this.store.subscribeToDocumentChangeEvent(this.editorId, callback);
    }

    onSettingChange(callback: (event: SettingChange, editorId: string) => void): void {
        if (!this.isCurrent()) return;
        this.store.subscribeToSettingChangeEvent(this.editorId, callback);
    }

    onReseed(callback: () => void | Promise<void>): void {
        if (!this.isCurrent()) return;
        this.reseeds.push(callback);
    }

    onDispose(callback: () => void): void {
        if (!this.isCurrent()) {
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
        this.store.addToDisposals(this.editorId, disposable);
    }

    reseedCallbacks(): (() => void | Promise<void>)[] {
        return [...this.reseeds];
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const callback of this.disposeCallbacks.splice(0)) {
            callback();
        }
    }
}
