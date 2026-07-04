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

import { posix } from "node:path";

import { AuthTypePayload, Command, Engine, Query } from "@miragon/bpmn-modeler-shared";
import {
    ClipboardPort,
    DeploymentStatePort,
    DocumentPort,
    EditorHandle,
    EditorSubscription,
    MigrationScope,
    NotifierPort,
    PickerPort,
    ScriptLanguage,
    SecretStorePort,
    SettingChange,
    StatusBarPort,
    UserCancelledError,
} from "@miragon/bpmn-modeler-core";

import { BridgeSettings } from "./nodeAdapters";
import { Rpc } from "./rpc";
import { METHODS } from "./protocol/descriptor";
import {
    BasicAuthCredentials,
    ClipboardReadResult,
    DocumentSaveResult,
    DocumentWriteResult,
    OAuth2Credentials,
    PickerShowParams,
    PickerShowResult,
} from "./protocol/types";

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
 *
 * It also owns the per-editor **write-revision** state behind echo suppression:
 * every core-originated `document/write` mints a monotonic revision, and the
 * host echoes it back on the resulting `document/didChange` as `causedBy`, so
 * the bridge drops its own write by explicit causation rather than by comparing
 * content (LSP-style versioned `didChange`).
 */
export class DocumentMirror {
    private readonly meta = new Map<string, SessionMeta>();
    private readonly text = new Map<string, string>();

    // Per-editor monotonic write counter and the set of revisions still awaiting
    // their host echo. The set stays bounded: a changing write is consumed by
    // `isOwnEcho` when its echo arrives, and a no-op write (which the host never
    // echoes) is dropped via `forgetWriteRevision`, so an editor that round-trips
    // cleanly holds nothing here between writes.
    private readonly nextRevision = new Map<string, number>();
    private readonly pendingOwnRevisions = new Map<string, Set<number>>();

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

    /**
     * Mints the next write revision for an editor and records it as a pending own
     * revision, so the host's echo of this write can be recognised by
     * {@link isOwnEcho}. Starts at 1 (0 would be ambiguous with an absent
     * `causedBy` on the wire).
     */
    nextWriteRevision(editorId: string): number {
        const revision = (this.nextRevision.get(editorId) ?? 0) + 1;
        this.nextRevision.set(editorId, revision);
        let pending = this.pendingOwnRevisions.get(editorId);
        if (!pending) {
            pending = new Set();
            this.pendingOwnRevisions.set(editorId, pending);
        }
        pending.add(revision);
        return revision;
    }

    /**
     * True iff `causedBy` is one of this editor's pending own revisions; consumes
     * it so the set stays bounded. A stale/unknown `causedBy` (or one already
     * consumed) returns false — that change still renders, never mistaken for an
     * echo.
     */
    isOwnEcho(editorId: string, causedBy: number): boolean {
        return this.pendingOwnRevisions.get(editorId)?.delete(causedBy) ?? false;
    }

    /**
     * Drops a pending own revision that will never be echoed. A no-op write (the
     * host's `Document` already holds the content, e.g. after `\r\n`→`\n`
     * normalisation) fires no `document/didChange`, so its minted revision would
     * otherwise linger forever; the caller forgets it to keep the set bounded.
     */
    forgetWriteRevision(editorId: string, revision: number): void {
        this.pendingOwnRevisions.get(editorId)?.delete(revision);
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
        this.nextRevision.delete(editorId);
        this.pendingOwnRevisions.delete(editorId);
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
        // Tag the write so the host's echoed `document/didChange` carries this
        // revision as `causedBy`; the mirror update keeps sync `getContent` correct.
        const revision = this.mirror.nextWriteRevision(this.id);
        const result = (await this.rpc.request(METHODS.documentWrite, {
            editorId: this.id,
            content,
            revision,
        })) as DocumentWriteResult | null;
        this.mirror.setContent(this.id, content);
        const changed = result?.changed ?? false;
        // A no-op write echoes nothing back, so its revision would never be
        // consumed by isOwnEcho — drop it now to keep pendingOwnRevisions bounded.
        if (!changed) this.mirror.forgetWriteRevision(this.id, revision);
        return changed;
    }

    async save(): Promise<boolean> {
        const result = (await this.rpc.request(METHODS.documentSave, {
            editorId: this.id,
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
        this.rpc.notify(METHODS.editorPostMessage, { editorId: this.id, message });
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
        // Tag the write so the host's echoed `document/didChange` carries this
        // revision as `causedBy` (see DocumentMirror.isOwnEcho).
        const revision = this.mirror.nextWriteRevision(editorId);
        const result = (await this.rpc.request(METHODS.documentWrite, {
            editorId,
            content,
            revision,
        })) as DocumentWriteResult | null;
        // Keep the mirror current so a later synchronous getContent() is correct.
        this.mirror.setContent(editorId, content);
        const changed = result?.changed ?? false;
        // A no-op write echoes nothing back, so its revision would never be
        // consumed by isOwnEcho — drop it now to keep pendingOwnRevisions bounded.
        if (!changed) this.mirror.forgetWriteRevision(editorId, revision);
        return changed;
    }

    async save(editorId: string): Promise<boolean> {
        const result = (await this.rpc.request(METHODS.documentSave, {
            editorId,
        })) as DocumentSaveResult | null;
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
        this.rpc.notify(METHODS.notifierShowInfo, { message });
    }

    showError(message: string): void {
        this.rpc.notify(METHODS.notifierShowError, { message });
    }

    notifyError(context: string, error: Error): void {
        // Preserve the log-then-toast convention: the host logs the detail and
        // shows a balloon pairing the caller's context with the error message.
        this.rpc.notify(METHODS.notifierLog, {
            level: "error",
            message: `${context}: ${error.message}`,
        });
        this.rpc.notify(METHODS.notifierNotifyError, { context, message: error.message });
    }

    openLoggingConsole(): void {
        this.rpc.notify(METHODS.notifierOpenConsole, {});
    }

    logDebug(message: string): void {
        this.rpc.notify(METHODS.notifierLog, { level: "debug", message });
    }

    logInfo(message: string): void {
        this.rpc.notify(METHODS.notifierLog, { level: "info", message });
    }

    logWarning(message: string): void {
        this.rpc.notify(METHODS.notifierLog, { level: "warn", message });
    }

    /** A bare `string` (e.g. a webview stack) is forwarded verbatim, not re-wrapped. */
    logError(error: string | Error): void {
        this.rpc.notify(METHODS.notifierLog, {
            level: "error",
            message: error instanceof Error ? error.message : error,
        });
    }

    /**
     * The progress task runs core-side (that is where the work is); the host
     * only renders a spinner, so we bracket the local run with start/end
     * notifications and `finally` guarantees the spinner clears even on throw.
     */
    async withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
        this.rpc.notify(METHODS.notifierProgressStart, { title });
        try {
            return await task();
        } finally {
            this.rpc.notify(METHODS.notifierProgressEnd, { title });
        }
    }

    async openDocument(absolutePath: string): Promise<void> {
        this.rpc.notify(METHODS.notifierOpenDocument, { path: absolutePath });
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
        this.rpc.notify(METHODS.statusBarTemplatesLoading, {});
    }

    showElementTemplatesReady(count: number): void {
        this.rpc.notify(METHODS.statusBarTemplatesReady, { count });
    }

    hideElementTemplatesStatus(): void {
        this.rpc.notify(METHODS.statusBarTemplatesHide, {});
    }

    showEngineVersion(platform: Engine, version: string): void {
        this.rpc.notify(METHODS.statusBarShowEngineVersion, { platform, version });
    }

    hideEngineVersion(): void {
        this.rpc.notify(METHODS.statusBarHideEngineVersion, {});
    }

    disposeEngineVersionStatus(): void {
        this.rpc.notify(METHODS.statusBarDisposeEngineVersion, {});
    }

    showBpmnlintActive(): void {
        /* not supported yet for intellij */
    }

    showBpmnlintNoConfig(): void {
        /* not supported yet for intellij */
    }

    hideBpmnlintStatus(): void {
        /* not supported yet for intellij */
    }
}

/**
 * Routes {@link ClipboardPort} calls to the host's system clipboard so the
 * sandboxed-iframe mediator pattern works out-of-process: the webview can't
 * reach the clipboard, the core can't either (it's a subprocess), so the host
 * does the real read/write on their behalf.
 *
 * Read is a request — the core needs the value back to satisfy a paste — while
 * write is fire-and-forget, matching the notifier/status-bar split (a copy needs
 * no confirmation, and the mediator already swallows/logs failures).
 */
export class RpcClipboard implements ClipboardPort {
    constructor(private readonly rpc: Rpc) {}

    async readClipboard(): Promise<string> {
        const result = (await this.rpc.request(
            METHODS.clipboardRead,
            {},
        )) as ClipboardReadResult | null;
        return result?.text ?? "";
    }

    async writeClipboard(text: string): Promise<void> {
        this.rpc.notify(METHODS.clipboardWrite, { text });
    }
}

/**
 * Routes the core's {@link SecretStorePort} to the host's PasswordSafe-backed
 * credential store. Unlike the fire-and-forget Notifier/StatusBar ports, all four
 * calls are **requests**: the deployment service awaits a save before reporting
 * success and awaits a read before pre-filling the form, so each must resolve only
 * once the host has actually persisted/fetched the secret. A read maps a `null`
 * host result to `undefined` to satisfy the port's `| undefined` contract.
 */
export class RpcSecretStore implements SecretStorePort {
    constructor(private readonly rpc: Rpc) {}

    async saveBasicAuth(username: string, password: string): Promise<void> {
        await this.rpc.request(METHODS.secretStoreSaveBasicAuth, { username, password });
    }

    async getBasicAuth(): Promise<BasicAuthCredentials | undefined> {
        const result = (await this.rpc.request(
            METHODS.secretStoreGetBasicAuth,
            {},
        )) as BasicAuthCredentials | null;
        return result ?? undefined;
    }

    async saveOAuth2(clientId: string, clientSecret: string): Promise<void> {
        await this.rpc.request(METHODS.secretStoreSaveOAuth2, { clientId, clientSecret });
    }

    async getOAuth2(): Promise<OAuth2Credentials | undefined> {
        const result = (await this.rpc.request(
            METHODS.secretStoreGetOAuth2,
            {},
        )) as OAuth2Credentials | null;
        return result ?? undefined;
    }
}

/** Snapshot of the non-secret deployment-form state the host persists across sessions. */
export interface DeploymentStateSnapshot {
    endpoint: string;
    tenantId: string;
    authType: AuthTypePayload;
    tokenEndpoint: string;
    audience: string;
}

/** Render-safe defaults before the host's first seed arrives. */
const EMPTY_DEPLOYMENT_STATE: DeploymentStateSnapshot = {
    endpoint: "",
    tenantId: "",
    authType: "none",
    tokenEndpoint: "",
    audience: "",
};

/**
 * RPC-backed {@link DeploymentStatePort} with a local mirror.
 *
 * The port's getters are **synchronous** (`getEndpoint(): string`, …), so the
 * bridge cannot await an RPC per read. Mirroring the {@link BridgeSettings}
 * pattern: the host seeds a snapshot once on startup (`deploymentState/seed`);
 * getters read the mirror.
 *
 * Ownership is single-writer: the in-process **snapshot is authoritative** for
 * reads, and the host is a persisted replica reconciled on the next re-seed. The
 * `save*` methods update the snapshot optimistically (so in-process reads and
 * the form UX stay correct), then send an **acknowledged** request to persist.
 * A persist failure is *logged* via the notifier rather than left to diverge
 * silently — but it is not rethrown: a failed persist must not fail an otherwise
 * successful deploy (`DeploymentService.deploy` awaits these post-success).
 * The snapshot is deliberately *not* rolled back on failure — reverting
 * mid-session would surface stale form values; the next seed reconciles.
 * Secrets are out of scope here — they ride {@link RpcSecretStore} / PasswordSafe.
 */
export class RpcDeploymentState implements DeploymentStatePort {
    private snapshot: DeploymentStateSnapshot = { ...EMPTY_DEPLOYMENT_STATE };

    constructor(
        private readonly rpc: Rpc,
        private readonly notifier: NotifierPort,
    ) {}

    /** Replaces the mirror from the host's seed (sent once on startup / after persist). */
    seed(next: Partial<DeploymentStateSnapshot>): void {
        this.snapshot = { ...this.snapshot, ...next };
    }

    /**
     * Persists via an acknowledged host request; on failure logs (does not throw)
     * so a persist error never fails the surrounding deploy. The optimistic
     * snapshot update has already happened, so the divergence is bounded to the
     * host's persisted copy until the next re-seed.
     */
    private async persist(method: string, params: Record<string, unknown>): Promise<void> {
        try {
            await this.rpc.request(method, params);
        } catch (error) {
            this.notifier.logError(
                error instanceof Error
                    ? new Error(`Failed to persist deployment state (${method}): ${error.message}`)
                    : new Error(`Failed to persist deployment state (${method})`),
            );
        }
    }

    getEndpoint(): string {
        return this.snapshot.endpoint;
    }

    getTenantId(): string {
        return this.snapshot.tenantId;
    }

    getAuthType(): AuthTypePayload {
        return this.snapshot.authType;
    }

    getTokenEndpoint(): string {
        return this.snapshot.tokenEndpoint;
    }

    getAudience(): string {
        return this.snapshot.audience;
    }

    async saveAuthType(authType: AuthTypePayload): Promise<void> {
        this.snapshot = { ...this.snapshot, authType };
        await this.persist(METHODS.deploymentStateSaveAuthType, { authType });
    }

    async saveOAuth2Config(tokenEndpoint: string, audience: string): Promise<void> {
        this.snapshot = { ...this.snapshot, tokenEndpoint, audience };
        await this.persist(METHODS.deploymentStateSaveOAuth2Config, { tokenEndpoint, audience });
    }

    async save(endpoint: string, tenantId: string): Promise<void> {
        this.snapshot = { ...this.snapshot, endpoint, tenantId };
        await this.persist(METHODS.deploymentStateSave, { endpoint, tenantId });
    }
}

/**
 * Narrow file-discovery dependency for {@link RpcPicker.pickWorkspaceFiles} —
 * the one picker that searches the workspace rather than receiving its
 * candidates. Typed as a slice of `WorkspacePort` so it is trivially satisfied
 * by `NodeWorkspace` and stubbable in tests.
 */
export interface FileFinder {
    findFiles(pattern: string, exclude?: string | null, limit?: number): Promise<string[]>;
}

/**
 * Real {@link PickerPort} over RPC: the host shows a native `JBPopup` list and
 * replies with the chosen indices (or `null` on dismissal); this class keeps
 * each prompt's item array and re-applies the cancel-vs-throw convention.
 *
 * The convention lives here, not in Kotlin, so it stays byte-for-byte identical
 * to `VsCodePicker` (the contract's reference) and the host carries no
 * per-picker logic — it only renders a generic chooser.
 */
export class RpcPicker implements PickerPort {
    constructor(
        private readonly rpc: Rpc,
        private readonly fileFinder: FileFinder,
    ) {}

    /** Round-trips one popup; returns the chosen indices or `null` on cancel. */
    private async show(opts: PickerShowParams): Promise<number[] | null> {
        const result = (await this.rpc.request(
            METHODS.pickerShow,
            opts,
        )) as PickerShowResult | null;
        return result?.selected ?? null;
    }

    async pickExecutionPlatform(placeHolder: string, items: string[]): Promise<Engine> {
        const selected = await this.show({
            placeholder: placeHolder,
            canPickMany: false,
            items: items.map((label) => ({ label })),
        });
        if (selected === null) {
            throw new UserCancelledError();
        }
        const result = items[selected[0]];
        if (result === "Camunda 7") {
            return "c7";
        } else if (result === "Camunda 8") {
            return "c8";
        }
        throw new Error(`Unknown execution platform version: "${result}"`);
    }

    async pickMigrationScope(c7Count: number, c8Count: number): Promise<MigrationScope> {
        const items = [
            `Camunda 7 only (${c7Count} diagram${c7Count !== 1 ? "s" : ""})`,
            `Camunda 8 only (${c8Count} diagram${c8Count !== 1 ? "s" : ""})`,
            `Both (${c7Count + c8Count} diagram${c7Count + c8Count !== 1 ? "s" : ""})`,
        ];
        const selected = await this.show({
            placeholder: "Which diagrams do you want to migrate?",
            canPickMany: false,
            items: items.map((label) => ({ label })),
        });
        if (selected === null) {
            throw new UserCancelledError();
        }
        const result = items[selected[0]];
        if (result.startsWith("Camunda 7")) {
            return "c7";
        } else if (result.startsWith("Camunda 8")) {
            return "c8";
        }
        return "both";
    }

    async pickEngineVersion(platform: Engine, versions: readonly string[]): Promise<string> {
        const label = platform === "c7" ? "Camunda 7" : "Camunda 8";
        const selected = await this.show({
            placeholder: `Select ${label} engine version`,
            canPickMany: false,
            items: versions.map((version) => ({ label: version })),
        });
        if (selected === null) {
            throw new UserCancelledError();
        }
        return versions[selected[0]];
    }

    async pickWorkspaceFiles(opts: {
        glob: string;
        exclude?: string | null;
        placeholder: string;
        limit?: number;
    }): Promise<string[]> {
        const paths = await this.fileFinder.findFiles(opts.glob, opts.exclude, opts.limit);
        const selected = await this.show({
            placeholder: opts.placeholder,
            canPickMany: true,
            items: paths.map((path) => ({ label: posix.basename(path), description: path })),
        });
        return selected?.map((index) => paths[index]) ?? [];
    }

    async pickPayloadFile(paths: string[]): Promise<{ filePath: string; label: string } | null> {
        const selected = await this.show({
            placeholder: "Select a payload file",
            canPickMany: false,
            items: paths.map((path) => ({ label: posix.basename(path), description: path })),
        });
        if (selected === null) {
            return null;
        }
        const filePath = paths[selected[0]];
        return { filePath, label: posix.basename(filePath) };
    }

    async pickScriptLanguage(currentFormat: string): Promise<string | undefined> {
        const normalized = currentFormat.toLowerCase().trim();
        // Pin the current format to the top so it stays the default highlighted
        // option even when unrecognised (mirrors VsCodePicker).
        const formats = [...ScriptLanguage.supportedFormats()].sort((a, b) => {
            if (a === normalized) return -1;
            if (b === normalized) return 1;
            return 0;
        });
        const selected = await this.show({
            title: "Script Language",
            placeholder: "Select the scripting language",
            canPickMany: false,
            items: formats.map((format) => ({
                label: format.charAt(0).toUpperCase() + format.slice(1),
                description: `.${new ScriptLanguage(format).extension}`,
            })),
        });
        return selected === null ? undefined : formats[selected[0]];
    }

    async pickReferencedModel(paths: string[]): Promise<string | undefined> {
        // Sort by path so nearby files surface first. The bridge has no VS Code
        // `asRelativePath`, so the absolute path is both the detail and sort key.
        const sorted = [...paths].sort((a, b) => a.localeCompare(b));
        const selected = await this.show({
            placeholder: "Select the referenced model to open",
            canPickMany: false,
            items: sorted.map((path) => ({ label: posix.basename(path), description: path })),
        });
        return selected === null ? undefined : sorted[selected[0]];
    }
}
