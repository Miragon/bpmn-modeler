/* eslint-disable @typescript-eslint/no-empty-function -- several host-capability
   methods are intentionally inert in this spike (no-ops until the real IntelliJ
   adapters land: #1063–#1066); the empty bodies are the point, not an oversight. */
/**
 * RPC-backed implementations of the host-capability ports the BPMN slice needs.
 *
 * These are the heart of the spike: they let the **unmodified** core
 * (`BpmnModelerService`, `EditorSessionStore`, `WebviewMessageRouter`) run in a
 * Node subprocess while the actual editor/document/webview live in the IntelliJ
 * (Kotlin) host. Every capability the core invokes becomes a JSON-RPC call back
 * to the host; everything the host observes becomes a notification into the core.
 *
 * The one subtlety worth its own type is {@link DocumentMirror}: the core reads
 * `DocumentPort.getContent()` **synchronously** (see `BpmnModelerService.display`),
 * which is impossible over async RPC. The host therefore pushes the document
 * text into the core on open/change (LSP `didOpen`/`didChange` style) so reads
 * hit a local cache instead of blocking on a round-trip.
 */

import { Command, Engine, Query } from "@miragon/bpmn-modeler-shared";

import { EditorHandle, EditorSubscription } from "../shared/domain/EditorSession";
import { DocumentPort, NotifierPort, PickerPort, StatusBarPort } from "../shared/domain/hostPorts";
import { Rpc } from "./rpc";

/** Per-editor metadata + cached document text, keyed by `editorId` (the URI string). */
export interface SessionMeta {
    editorId: string;
    uriString: string;
    path: string;
    fsPath: string;
    scheme: string;
    /** Host-provided workspace root, used to seed element-template discovery. */
    workspaceRoot?: string;
}

/**
 * Local mirror of every open document's text + identity, seeded by the host on
 * `session/register` and refreshed on `document/didChange`. Exists solely to make
 * the core's synchronous `getContent()` work without a blocking RPC round-trip.
 */
export class DocumentMirror {
    private readonly meta = new Map<string, SessionMeta>();
    private readonly text = new Map<string, string>();

    register(meta: SessionMeta, content: string): void {
        this.meta.set(meta.editorId, meta);
        this.text.set(meta.editorId, content);
    }

    setContent(editorId: string, content: string): void {
        this.text.set(editorId, content);
    }

    content(editorId: string): string {
        return this.text.get(editorId) ?? "";
    }

    require(editorId: string): SessionMeta {
        const meta = this.meta.get(editorId);
        if (!meta) {
            throw new Error(`No session metadata for editor: ${editorId}`);
        }
        return meta;
    }

    /** Non-throwing metadata lookup for teardown paths that tolerate absence. */
    peek(editorId: string): SessionMeta | undefined {
        return this.meta.get(editorId);
    }

    remove(editorId: string): void {
        this.meta.delete(editorId);
        this.text.delete(editorId);
    }
}

/**
 * One open editor session, as seen by the core. `postMessage` and the document
 * mutators forward to the host over RPC; `getContent` reads the mirror.
 *
 * {@link receive} is the inbound hook: when the host forwards a webview message,
 * the server calls it, which fires the `onDidReceiveMessage` callback the
 * `EditorSessionStore` wired to the `WebviewMessageRouter` — i.e. the exact same
 * dispatch path the VS Code host uses, just driven from a different transport.
 */
export class RpcEditorHandle implements EditorHandle {
    readonly id: string;

    private receiveCallback?: (message: Command) => void;
    private readonly disposeCallbacks: Array<() => void> = [];
    private readonly subscriptions: EditorSubscription[] = [];

    constructor(
        private readonly meta: SessionMeta,
        private readonly mirror: DocumentMirror,
        private readonly rpc: Rpc,
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

    async writeContent(content: string): Promise<boolean> {
        const result = (await this.rpc.request("document/write", {
            editorId: this.id,
            content,
        })) as { changed?: boolean } | null;
        this.mirror.setContent(this.id, content);
        return result?.changed ?? false;
    }

    async save(): Promise<boolean> {
        const result = (await this.rpc.request("document/save", { editorId: this.id })) as {
            saved?: boolean;
        } | null;
        return result?.saved ?? false;
    }

    /**
     * The `EditorHandle`-over-RPC proof: the core drives a JCEF browser it cannot
     * touch by emitting a notification the host turns into `window.postMessage`.
     * Returns `true` unconditionally — the spike has no hidden-panel state to
     * report (the real handle returns webview visibility here).
     */
    async postMessage(message: Command | Query): Promise<boolean> {
        this.rpc.notify("editor/postMessage", { editorId: this.id, message });
        return true;
    }

    isActive(): boolean {
        return true;
    }

    addSubscription(subscription: EditorSubscription): void {
        this.subscriptions.push(subscription);
    }

    dispose(): void {
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
        this.disposeCallbacks.push(callback);
        return { dispose: () => {} };
    }

    // The spike has a single, always-active editor and does not re-render on
    // external edits, so these lifecycle events are inert no-ops here.
    onDidBecomeActive(): EditorSubscription {
        return { dispose: () => {} };
    }

    onDidChangeDocument(): EditorSubscription {
        return { dispose: () => {} };
    }

    onDidChangeSetting(): EditorSubscription {
        return { dispose: () => {} };
    }

    /** Delivers a host-forwarded webview command into the core's dispatch path. */
    receive(message: Command): void {
        this.receiveCallback?.(message);
    }
}

/** Routes `DocumentPort` calls to the host; serves reads from the {@link DocumentMirror}. */
export class RpcDocumentPort implements DocumentPort {
    constructor(
        private readonly rpc: Rpc,
        private readonly mirror: DocumentMirror,
    ) {}

    getContent(editorId: string): string {
        return this.mirror.content(editorId);
    }

    getFilePath(editorId: string): string {
        return this.mirror.require(editorId).fsPath;
    }

    async write(editorId: string, content: string): Promise<boolean> {
        const result = (await this.rpc.request("document/write", { editorId, content })) as {
            changed?: boolean;
        } | null;
        // Keep the mirror current so a later synchronous getContent() is correct.
        this.mirror.setContent(editorId, content);
        return result?.changed ?? false;
    }

    async save(editorId: string): Promise<boolean> {
        const result = (await this.rpc.request("document/save", { editorId })) as {
            saved?: boolean;
        } | null;
        return result?.saved ?? false;
    }
}

/**
 * Routes notifications/logging to the host log (proves a second core→host port
 * direction cheaply). The picker is hard-stubbed because a non-empty `.bpmn`
 * file never hits the picker path; status-bar updates surface as host log lines.
 */
export class StubNotifier implements NotifierPort {
    constructor(private readonly rpc: Rpc) {}

    private emit(level: string, message: string): void {
        this.rpc.notify("notifier/log", { level, message });
    }

    showInfo(message: string): void {
        this.emit("info", message);
    }
    showError(message: string): void {
        this.emit("error", message);
    }
    notifyError(context: string, error: Error): void {
        this.emit("error", `${context}: ${error.message}`);
    }
    openLoggingConsole(): void {}
    logInfo(message: string): void {
        this.emit("info", message);
    }
    logWarning(message: string): void {
        this.emit("warn", message);
    }
    logError(error: Error): void {
        this.emit("error", error.message);
    }
    async withProgress<T>(_title: string, task: () => Promise<T>): Promise<T> {
        return task();
    }
    async openDocument(): Promise<void> {}
}

export class StubPicker implements PickerPort {
    // Only execution-platform selection can be reached in the spike, and only for
    // an undetectable/empty diagram; default to c7 so rendering never blocks.
    async pickExecutionPlatform(): Promise<Engine> {
        return "c7";
    }
    async pickMigrationScope(): Promise<never> {
        throw new Error("Picker not available in the IntelliJ spike");
    }
    async pickEngineVersion(): Promise<never> {
        throw new Error("Picker not available in the IntelliJ spike");
    }
    async pickWorkspaceFiles(): Promise<string[]> {
        return [];
    }
    async pickPayloadFile(): Promise<null> {
        return null;
    }
    async pickScriptLanguage(): Promise<undefined> {
        return undefined;
    }
    async pickReferencedModel(): Promise<undefined> {
        return undefined;
    }
}

export class StubStatusBar implements StatusBarPort {
    constructor(private readonly rpc: Rpc) {}

    showElementTemplatesLoading(): void {}
    showElementTemplatesReady(): void {}
    hideElementTemplatesStatus(): void {}
    showEngineVersion(platform: Engine, version: string): void {
        this.rpc.notify("statusBar/showEngineVersion", { platform, version });
    }
    hideEngineVersion(): void {}
    disposeEngineVersionStatus(): void {}
}
