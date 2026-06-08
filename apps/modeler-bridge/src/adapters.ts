/**
 * RPC-backed implementations of the host-capability ports the BPMN slice needs.
 *
 * These let the **unmodified** core (`BpmnModelerService`,
 * `EditorSessionStore`, `WebviewMessageRouter`) run in a subprocess while the
 * actual editor/document/webview live in the IntelliJ (Kotlin) host. Every
 * capability the core invokes becomes a JSON-RPC call back to the host;
 * everything the host observes becomes a notification into the core.
 *
 * The one subtlety worth its own type is {@link DocumentMirror}: the core reads
 * `DocumentPort.getContent()` **synchronously** (see `BpmnModelerService.display`),
 * which is impossible over async RPC. The host therefore pushes the document
 * text into the core on open/change (LSP `didOpen`/`didChange` style) so reads
 * hit a local cache instead of blocking on a round-trip.
 */

import { Command, Engine, Query } from "@miragon/bpmn-modeler-shared";
import {
    DocumentPort,
    EditorHandle,
    EditorSubscription,
    NotifierPort,
    PickerPort,
    SettingChange,
    StatusBarPort,
} from "@miragon/bpmn-modeler-core";

import { BridgeSettings } from "./nodeAdapters";
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
 * `session/register` and refreshed on `document/didChange`. Exists solely to
 * make the core's synchronous `getContent()` work without a blocking RPC
 * round-trip.
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
     * The `EditorHandle`-over-RPC seam: the core drives a JCEF browser it cannot
     * touch by emitting a notification the host turns into `window.postMessage`.
     * Returns `true` unconditionally — there is no hidden-panel state to report
     * (the VS Code handle returns webview visibility here).
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

    // The host owns the editor and re-registers on its own state changes, so
    // these lifecycle events have nothing to fire here.
    onDidBecomeActive(): EditorSubscription {
        return { dispose: () => {} };
    }

    onDidChangeDocument(): EditorSubscription {
        return { dispose: () => {} };
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
 * Forwards every {@link NotifierPort} call to the host so it can surface real
 * IntelliJ UI — `Notifications.Bus` balloons for the user-facing methods and an
 * IDE log/console for the diagnostic ones. (Replaces the spike's log-only stub:
 * the host, not the core, decides balloon vs. log.)
 */
export class RpcNotifier implements NotifierPort {
    constructor(private readonly rpc: Rpc) {}

    showInfo(message: string): void {
        this.rpc.notify("notifier/showInfo", { message });
    }

    showError(message: string): void {
        this.rpc.notify("notifier/showError", { message });
    }

    notifyError(context: string, error: Error): void {
        // Preserve the log-then-toast convention: the host logs the detail and
        // shows a balloon pairing the caller's context with the error message.
        this.rpc.notify("notifier/log", {
            level: "error",
            message: `${context}: ${error.message}`,
        });
        this.rpc.notify("notifier/notifyError", { context, message: error.message });
    }

    openLoggingConsole(): void {
        this.rpc.notify("notifier/openConsole", {});
    }

    logInfo(message: string): void {
        this.rpc.notify("notifier/log", { level: "info", message });
    }

    logWarning(message: string): void {
        this.rpc.notify("notifier/log", { level: "warn", message });
    }

    logError(error: Error): void {
        this.rpc.notify("notifier/log", { level: "error", message: error.message });
    }

    /**
     * The progress task runs core-side (that is where the work is); the host
     * only renders a spinner, so we bracket the local run with start/end
     * notifications and `finally` guarantees the spinner clears even on throw.
     */
    async withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
        this.rpc.notify("notifier/progressStart", { title });
        try {
            return await task();
        } finally {
            this.rpc.notify("notifier/progressEnd", { title });
        }
    }

    async openDocument(absolutePath: string): Promise<void> {
        this.rpc.notify("notifier/openDocument", { path: absolutePath });
    }
}

/**
 * Forwards every {@link StatusBarPort} call to the host, which owns the actual
 * `StatusBarWidget` (element-template count + engine version). The core stays
 * the single source of truth for *what* to show; the host decides *how*.
 */
export class RpcStatusBar implements StatusBarPort {
    constructor(private readonly rpc: Rpc) {}

    showElementTemplatesLoading(): void {
        this.rpc.notify("statusBar/templatesLoading", {});
    }

    showElementTemplatesReady(count: number): void {
        this.rpc.notify("statusBar/templatesReady", { count });
    }

    hideElementTemplatesStatus(): void {
        this.rpc.notify("statusBar/templatesHide", {});
    }

    showEngineVersion(platform: Engine, version: string): void {
        this.rpc.notify("statusBar/showEngineVersion", { platform, version });
    }

    hideEngineVersion(): void {
        this.rpc.notify("statusBar/hideEngineVersion", {});
    }

    disposeEngineVersionStatus(): void {
        this.rpc.notify("statusBar/disposeEngineVersion", {});
    }
}

/**
 * Stub {@link PickerPort}: the BPMN-render foundation never reaches a picker for
 * a non-empty diagram. Domain-aware pickers (engine, migration scope, …) are a
 * later host port (#1064); until then the unreachable prompts throw and the two
 * render-safe defaults keep an empty/undetectable diagram from blocking.
 */
export class StubPicker implements PickerPort {
    async pickExecutionPlatform(): Promise<Engine> {
        return "c7";
    }
    async pickMigrationScope(): Promise<never> {
        throw new Error("Picker not available in the IntelliJ host yet (#1064)");
    }
    async pickEngineVersion(): Promise<never> {
        throw new Error("Picker not available in the IntelliJ host yet (#1064)");
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
