import { Command, Query } from "@miragon/bpmn-modeler-shared";
import { DocumentChangeEvent, EditorSubscription, SettingChange } from "@miragon/bpmn-modeler-core";
import { BridgeSettings } from "../../../kernel/adapter/out/BridgeSettings";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { DocumentSaveResult, DocumentWriteResult, SessionMeta } from "../../../protocol/domain/types";
import { DocumentMirror } from "../../domain/DocumentMirror";
import { HostEditorHandle } from "../../port/HostEditorHandle";

/**
 * One open editor session, as seen by the core. `postMessage` and the document
 * mutators forward to the host over RPC; `getContent` reads the mirror.
 *
 * {@link receive} is the inbound hook: when the host forwards a webview message,
 * the server calls it, which fires the `onDidReceiveMessage` callback the
 * `EditorSessionStore` wired to the `WebviewMessageRouter` — i.e. the exact same
 * dispatch path the VS Code host uses, just driven from a different transport.
 */
export class RpcEditorHandle implements HostEditorHandle {
    readonly id: string;

    private receiveCallback?: (message: Command) => void;
    private readonly disposeCallbacks = new Set<() => void>();
    private readonly activeCallbacks = new Set<(active: boolean) => void>();
    private readonly subscriptions: EditorSubscription[] = [];
    private active = false;
    private disposed = false;

    constructor(
        private readonly meta: SessionMeta,
        private readonly mirror: DocumentMirror,
        private readonly rpc: Rpc,
        private readonly settings: BridgeSettings,
    ) {
        this.id = meta.editorId;
    }

    documentUriString(): string {
        return this.meta.uriString;
    }

    documentPath(): string {
        return this.meta.path;
    }

    documentFsPath(): string {
        return this.meta.fsPath;
    }

    documentScheme(): string {
        return this.meta.scheme;
    }

    getContent(): string {
        return this.mirror.content(this.id);
    }

    async writeContent(content: string, expectedDocumentRevision?: number): Promise<boolean> {
        const result = (await this.rpc.request(METHODS.documentWrite, {
            editorId: this.id,
            sessionId: this.meta.sessionId,
            content,
            expectedDocumentRevision,
        })) as DocumentWriteResult | null;
        return this.mirror.completeWrite(this.id, this.meta.sessionId, content, result);
    }

    async save(): Promise<boolean> {
        const result = (await this.rpc.request(METHODS.documentSave, {
            editorId: this.id,
            sessionId: this.meta.sessionId,
        })) as DocumentSaveResult | null;
        return result?.saved ?? false;
    }

    /**
     * The `EditorHandle`-over-RPC seam: the core drives a JCEF browser it cannot
     * touch by emitting a notification the host turns into `window.postMessage`.
     * Returns `true` unconditionally — there is no hidden-panel state to report
     * (the VS Code handle returns webview visibility here).
     */
    async postMessage(message: Command | Query): Promise<boolean> {
        this.rpc.notify(METHODS.editorPostMessage, {
            editorId: this.id,
            sessionId: this.meta.sessionId,
            message,
        });
        return true;
    }

    isActive(): boolean {
        return this.active;
    }

    /** The host reports tab focus through the store's active editor, which drives this. */
    setActive(active: boolean): void {
        if (active === this.active) return;
        this.active = active;
        [...this.activeCallbacks].forEach((callback) => callback(active));
    }

    addSubscription(subscription: EditorSubscription): void {
        this.subscriptions.push(subscription);
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.disposeCallbacks.forEach((callback) => callback());
        this.subscriptions.forEach((subscription) => subscription.dispose());
    }

    onDidReceiveMessage(callback: (message: Command) => void): EditorSubscription {
        this.receiveCallback = callback;
        return {
            dispose: () => {
                if (this.receiveCallback === callback) {
                    this.receiveCallback = undefined;
                }
            },
        };
    }

    onDidDispose(callback: () => void): EditorSubscription {
        this.disposeCallbacks.add(callback);
        return { dispose: () => this.disposeCallbacks.delete(callback) };
    }

    onDidChangeActive(callback: (active: boolean) => void): EditorSubscription {
        this.activeCallbacks.add(callback);
        return { dispose: () => this.activeCallbacks.delete(callback) };
    }

    /**
     * Fires for every mirrored content change of this document — an external
     * `document/didChange` and the acknowledged core write alike, as VS Code's
     * text-document event does.
     */
    onDidChangeDocument(callback: (event: DocumentChangeEvent) => void): EditorSubscription {
        return this.mirror.onDidChangeContent((editorId) => {
            if (editorId !== this.id) return;
            callback({
                hasContentChanges: () => true,
                documentUriString: () => this.meta.uriString,
                documentPath: () => this.meta.path,
            });
        });
    }

    /**
     * Bridges the host's pushed settings changes into this session. The shared
     * {@link BridgeSettings} is the event hub (one snapshot fans out to every open
     * editor), so each handle simply forwards its subscription — the same seam
     * `EditorSessionStore.subscribeToSettingChangeEvent` drives on VS Code.
     */
    onDidChangeSetting(callback: (event: SettingChange) => void): EditorSubscription {
        return this.settings.onDidChange(callback);
    }

    /** Delivers a host-forwarded webview command into the core's dispatch path. */
    receive(message: Command): void {
        this.receiveCallback?.(message);
    }
}

// IntelliJ's list popup shows no icons, so a choice travels without one.

