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

import { Command, Query } from "@miragon/bpmn-modeler-shared";
import { Engine, ENGINE_LABEL } from "@miragon/bpmn-modeler-types";
import {
    applyDeploymentStatePatch,
    ChoicePrompt,
    classifyLocateResult,
    ClipboardPort,
    ConfirmRequest,
    DEFAULT_DEPLOYMENT_STATE,
    DeploymentPickerPort,
    DeploymentState,
    DeploymentStatePatch,
    DeploymentStatePort,
    deploymentStateFrom,
    DocumentChangeEvent,
    DocumentPort,
    EditorHandle,
    EditorSubscription,
    errorLogText,
    LocatePrompts,
    LocateResult,
    MigrationPickerPort,
    MigrationScope,
    NEW_MODEL_ENGINE_CHOICES,
    NewModelEngine,
    notifiedErrorLogText,
    notifiedErrorToastText,
    NotifierPort,
    PickerPort,
    RawDeploymentState,
    ScriptLanguage,
    SearchPrompt,
    SecretStorePort,
    SettingChange,
    StatusBarPort,
    StatusSlot,
    StatusView,
    summarizeAffectedItems,
    TokenPromptPort,
    TokenStorePort,
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
    ConfirmShowParams,
    ConfirmShowResult,
    PickerShowParams,
    PickerShowResult,
    SecretApprovedDestinations,
    SecretGetApprovedDestinationsParams,
    SecretSaveApprovedDestinationsParams,
    StatusBarUpdateParams,
    TokenPromptShowResult,
    TokenStoreGetResult,
} from "./protocol/types";

/** Per-editor metadata + cached document text, keyed by `editorId` (the URI string). */
export interface SessionMeta {
    editorId: string;
    /** Exact host editor generation for rejecting same-URI stale traffic. */
    sessionId?: number;
    uriString: string;
    path: string;
    fsPath: string;
    scheme: string;
    /** Host-provided workspace root, used to seed element-template discovery. */
    workspaceRoot?: string;
}

/**
 * Local mirror of every open document's text + identity, seeded by the host on
 * `session/register`, refreshed on external `document/didChange` and on every
 * acknowledged core `document/write`. Exists solely to make the core's
 * synchronous `getContent()` work without a blocking RPC round-trip.
 */
export class DocumentMirror {
    private readonly meta = new Map<string, SessionMeta>();
    private readonly text = new Map<string, string>();
    private readonly contentListeners = new Set<(editorId: string) => void>();

    register(meta: SessionMeta, content: string): void {
        this.meta.set(meta.editorId, meta);
        this.text.set(meta.editorId, content);
    }

    setContent(editorId: string, content: string): void {
        this.text.set(editorId, content);
        this.contentListeners.forEach((listener) => listener(editorId));
    }

    /** Fires after any mirrored content update, so features can react to edits. */
    onDidChangeContent(listener: (editorId: string) => void): { dispose(): void } {
        this.contentListeners.add(listener);
        return { dispose: () => this.contentListeners.delete(listener) };
    }

    content(editorId: string): string {
        return this.text.get(editorId) ?? "";
    }

    /**
     * Applies the outcome of a core `document/write`. The host sends no
     * `document/didChange` echo for its own write, so the reply is the only
     * signal that the Document now holds these bytes. A reply for a replaced
     * session generation must not overwrite the current session's text.
     */
    completeWrite(
        editorId: string,
        sessionId: number | undefined,
        writtenContent: string,
        result: DocumentWriteResult | null,
    ): boolean {
        const changed = result?.accepted !== false && result?.changed === true;
        if (changed && this.meta.get(editorId)?.sessionId === sessionId) {
            this.setContent(editorId, result?.normalizedContent ?? writtenContent);
        }
        return changed;
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
        this.disposeCallbacks.push(callback);
        return { dispose: () => {} };
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

    async write(
        editorId: string,
        content: string,
        expectedDocumentRevision?: number,
    ): Promise<boolean> {
        const sessionId = this.mirror.require(editorId).sessionId;
        const result = (await this.rpc.request(METHODS.documentWrite, {
            editorId,
            sessionId,
            content,
            expectedDocumentRevision,
        })) as DocumentWriteResult | null;
        return this.mirror.completeWrite(editorId, sessionId, content, result);
    }

    async save(editorId: string): Promise<boolean> {
        const result = (await this.rpc.request(METHODS.documentSave, {
            editorId,
            sessionId: this.mirror.require(editorId).sessionId,
        })) as DocumentSaveResult | null;
        return result?.saved ?? false;
    }
}

/**
 * Forwards every {@link NotifierPort} call to the host so it can surface real
 * IntelliJ UI — `Notifications.Bus` balloons for the user-facing methods and an
 * IDE log/console for the diagnostic ones. The core picks the method and writes
 * its text; the host only renders it.
 */
export class RpcNotifier implements NotifierPort {
    constructor(private readonly rpc: Rpc) {}

    showInfo(message: string): void {
        this.rpc.notify(METHODS.notifierShowInfo, { message });
    }

    showWarning(message: string): void {
        this.rpc.notify(METHODS.notifierShowWarning, { message });
    }

    showError(message: string): void {
        this.rpc.notify(METHODS.notifierShowError, { message });
    }

    notifyError(context: string, error: Error): void {
        this.rpc.notify(METHODS.notifierLog, {
            level: "error",
            message: notifiedErrorLogText(context, error),
        });
        this.showError(notifiedErrorToastText(context, error));
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

    logError(error: string | Error): void {
        this.rpc.notify(METHODS.notifierLog, { level: "error", message: errorLogText(error) });
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
 * Sends each status slot's view to the host, which shows every slot in its own
 * `StatusBarWidget`. The core decides *what* a slot shows; the host only places
 * it.
 */
export class RpcStatusBar implements StatusBarPort {
    constructor(private readonly rpc: Rpc) {}

    show(slot: StatusSlot, view: StatusView): void {
        this.rpc.notify(METHODS.statusBarUpdate, { slot, view } satisfies StatusBarUpdateParams);
    }

    hide(slot: StatusSlot): void {
        this.rpc.notify(METHODS.statusBarUpdate, {
            slot,
            view: null,
        } satisfies StatusBarUpdateParams);
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
 * credential store. Unlike the fire-and-forget Notifier/StatusBar ports, all
 * calls are **requests**: the deployment service awaits a save before reporting
 * success and awaits a read before pre-filling the form, so each must resolve only
 * once the host has actually persisted/fetched the secret. A read maps a `null`
 * host result to `undefined` to satisfy the port's `| undefined` contract.
 */
export class RpcSecretStore implements SecretStorePort {
    constructor(private readonly rpc: Rpc) {}

    async saveBasicAuth(username: string, password: string, slot?: string): Promise<void> {
        await this.rpc.request(METHODS.secretStoreSaveBasicAuth, { username, password, slot });
    }

    async getBasicAuth(slot?: string): Promise<BasicAuthCredentials | undefined> {
        const result = (await this.rpc.request(METHODS.secretStoreGetBasicAuth, {
            slot,
        })) as BasicAuthCredentials | null;
        return result ?? undefined;
    }

    async saveOAuth2(clientId: string, clientSecret: string, slot?: string): Promise<void> {
        await this.rpc.request(METHODS.secretStoreSaveOAuth2, { clientId, clientSecret, slot });
    }

    async getOAuth2(slot?: string): Promise<OAuth2Credentials | undefined> {
        const result = (await this.rpc.request(METHODS.secretStoreGetOAuth2, {
            slot,
        })) as OAuth2Credentials | null;
        return result ?? undefined;
    }

    async getApprovedDestinations(slot: string): Promise<string[]> {
        const result = (await this.rpc.request(METHODS.secretStoreGetApprovedDestinations, {
            slot,
        } satisfies SecretGetApprovedDestinationsParams)) as SecretApprovedDestinations | null;
        return result?.origins ?? [];
    }

    async saveApprovedDestinations(slot: string, origins: string[]): Promise<void> {
        await this.rpc.request(METHODS.secretStoreSaveApprovedDestinations, {
            slot,
            origins,
        } satisfies SecretSaveApprovedDestinationsParams);
    }

    async delete(slot: string): Promise<void> {
        await this.rpc.request(METHODS.secretStoreDelete, { slot });
    }
}

/**
 * Routes the core's {@link TokenStorePort} to the host's PasswordSafe-backed
 * marketplace token store. Like {@link RpcSecretStore}, both calls are
 * **requests**: the marketplace service awaits a read before deciding whether to
 * prompt, and awaits a write before its auth retry, so each must resolve only
 * once the host has actually fetched/persisted. A `null` host result maps to
 * `undefined` to satisfy the port's `| undefined` contract.
 */
export class RpcTokenStore implements TokenStorePort {
    constructor(private readonly rpc: Rpc) {}

    async getToken(host: string): Promise<string | undefined> {
        const result = (await this.rpc.request(METHODS.tokenStoreGet, {
            host,
        })) as TokenStoreGetResult | null;
        return result?.token ?? undefined;
    }

    async setToken(host: string, token: string): Promise<void> {
        await this.rpc.request(METHODS.tokenStoreSet, { host, token });
    }
}

/**
 * Routes the core's {@link TokenPromptPort} to a host modal PAT-entry dialog. A
 * `null` result (decline) — or a blank one — maps to `undefined`, the port's
 * "declined" signal that keeps a background `updateAll` running. The host already
 * blank-checks, but re-guarding here keeps the contract honest independently.
 */
export class RpcTokenPrompt implements TokenPromptPort {
    constructor(private readonly rpc: Rpc) {}

    async promptForToken(host: string, reason: string): Promise<string | undefined> {
        const result = (await this.rpc.request(METHODS.tokenPromptShow, {
            host,
            reason,
        })) as TokenPromptShowResult | null;
        const token = result?.token?.trim();
        return token ? token : undefined;
    }
}

/**
 * RPC-backed {@link DeploymentStatePort} with a local mirror.
 *
 * `load()` is synchronous, so the bridge cannot await an RPC per read.
 * Mirroring the {@link BridgeSettings} pattern: the host seeds what it stored
 * once on startup (`deploymentState/seed`) and `load()` reads the mirror, which
 * the core normalises.
 *
 * Ownership is single-writer: the in-process **mirror is authoritative** for
 * reads, and the host is a persisted replica reconciled on the next re-seed.
 * `save` applies the patch to the mirror optimistically (so in-process reads and
 * the form UX stay correct), then sends it as one **acknowledged**
 * `deploymentState/save` request. A persist failure rejects so the core decides
 * what it means. The mirror is deliberately *not* rolled back on failure —
 * reverting mid-session would surface stale form values; the next seed
 * reconciles. Secrets are out of scope here — they ride {@link RpcSecretStore} /
 * PasswordSafe.
 */
export class RpcDeploymentState implements DeploymentStatePort {
    private state: DeploymentState = DEFAULT_DEPLOYMENT_STATE;

    constructor(private readonly rpc: Rpc) {}

    /** Replaces the mirror with what the host stored (sent on startup / respawn). */
    seed(stored: RawDeploymentState): void {
        this.state = deploymentStateFrom(stored);
    }

    load(): DeploymentState {
        return this.state;
    }

    async save(patch: DeploymentStatePatch): Promise<void> {
        this.state = applyDeploymentStatePatch(this.state, patch);
        await this.rpc.request(METHODS.deploymentStateSave, { patch });
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
 * Real {@link PickerPort}, {@link DeploymentPickerPort} and
 * {@link MigrationPickerPort} over RPC: the host shows a native `JBPopup` list and
 * replies with the chosen indices (or `null` on dismissal); this class keeps
 * each prompt's item array and re-applies the cancel-vs-throw convention.
 *
 * The convention lives here, not in Kotlin, so it stays byte-for-byte identical
 * to `VsCodePicker` (the contract's reference) and the host carries no
 * per-picker logic — it only renders a generic chooser.
 */
export class RpcPicker implements PickerPort, DeploymentPickerPort, MigrationPickerPort {
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

    async choose<V>(prompt: ChoicePrompt<V>): Promise<V | undefined> {
        const [index] = (await this.show(pickerShowParams(prompt, false))) ?? [];
        return index === undefined ? undefined : valueAt(prompt, index);
    }

    async chooseMany<V>(prompt: ChoicePrompt<V>): Promise<readonly V[]> {
        const selected = await this.show(pickerShowParams(prompt, true));
        return selected?.map((index) => valueAt(prompt, index)) ?? [];
    }

    /** A cancelled round trip resolves to `false`: silence is never consent. */
    async confirm(request: ConfirmRequest): Promise<boolean> {
        const result = (await this.rpc.request(METHODS.confirmShow, {
            title: request.title,
            confirmLabel: request.confirmLabel,
            details: [...request.details],
        } satisfies ConfirmShowParams)) as ConfirmShowResult | null;
        return result?.confirmed === true;
    }

    async searchAndChoose<R>(search: SearchPrompt<R>): Promise<{ outcome: R; chosen?: string }> {
        // The host can't render a busy list, so the search keeps its status-bar spinner.
        const title = search.searchingPlaceholder;
        this.rpc.notify(METHODS.notifierProgressStart, { title });
        let outcome: R;
        try {
            outcome = await search.search();
        } finally {
            this.rpc.notify(METHODS.notifierProgressEnd, { title });
        }

        const choices = search.choices(outcome);
        return { outcome, chosen: choices && (await this.choose(choices)) };
    }

    async pickNewModelEngine(placeHolder: string): Promise<NewModelEngine> {
        const selected = await this.show({
            placeholder: placeHolder,
            canPickMany: false,
            items: NEW_MODEL_ENGINE_CHOICES.map((choice) => ({
                label: choice.label,
                description: choice.description,
            })),
        });
        if (selected === null) {
            throw new UserCancelledError();
        }
        const choice = NEW_MODEL_ENGINE_CHOICES[selected[0]];
        if (!choice) {
            throw new Error(`No new-model engine at index ${selected[0]}`);
        }
        return choice.id;
    }

    async pickMigrationScope(c7Count: number, c8Count: number): Promise<MigrationScope> {
        const items = [
            `${ENGINE_LABEL.c7} only (${c7Count} diagram${c7Count !== 1 ? "s" : ""})`,
            `${ENGINE_LABEL.c8} only (${c8Count} diagram${c8Count !== 1 ? "s" : ""})`,
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
        if (result.startsWith(ENGINE_LABEL.c7)) {
            return "c7";
        } else if (result.startsWith(ENGINE_LABEL.c8)) {
            return "c8";
        }
        return "both";
    }

    async pickEngineVersion(platform: Engine, versions: readonly string[]): Promise<string> {
        const label = ENGINE_LABEL[platform];
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

    /**
     * Modal confirmation, rendered natively by the host.
     *
     * A cancelled or failed round trip resolves to `false`: silence must never
     * be read as consent to delete.
     */
    async confirmDestructive(options: {
        title: string;
        confirmLabel: string;
        details: string[];
    }): Promise<boolean> {
        const result = (await this.rpc.request(METHODS.confirmShow, {
            title: options.title,
            confirmLabel: options.confirmLabel,
            details: summarizeAffectedItems(options.details),
        } satisfies ConfirmShowParams)) as ConfirmShowResult | null;
        return result?.confirmed === true;
    }

    async pickDeploymentTarget(names: string[]): Promise<string | undefined> {
        // Index 0 is the explicit ad-hoc entry (→ ""); the rest map to `names`.
        const labels = ["(none — use form values)", ...names];
        const selected = await this.show({
            placeholder: "Select the active deployment target",
            canPickMany: false,
            items: labels.map((label) => ({ label })),
        });
        if (selected === null) {
            return undefined;
        }
        return selected[0] === 0 ? "" : names[selected[0] - 1];
    }

    async pickDeploymentStatusAction(opts: {
        targetName?: string;
        canVerify: boolean;
    }): Promise<"switch" | "verify" | undefined> {
        // Index 0 is always switch; index 1 (verify) only exists for a C7 target.
        const actions: ("switch" | "verify")[] = opts.canVerify ? ["switch", "verify"] : ["switch"];
        const labels = [
            "Switch deployment target…",
            ...(opts.canVerify ? [`Verify on ${opts.targetName}`] : []),
        ];
        const selected = await this.show({
            placeholder: opts.targetName
                ? `Deployment target "${opts.targetName}"`
                : "No deployment target selected",
            canPickMany: false,
            items: labels.map((label) => ({ label })),
        });
        return selected === null ? undefined : actions[selected[0]];
    }

    async searchAndPickLocatedFile(
        prompts: LocatePrompts,
        search: () => Promise<LocateResult>,
    ): Promise<{ outcome: LocateResult; chosen?: string }> {
        // The host can't render a busy list, so it keeps its status-bar spinner:
        // bracket the local search with the progress notifications, then open the
        // native picker only for an ambiguous result.
        const title = prompts.searchingPlaceholder;
        this.rpc.notify(METHODS.notifierProgressStart, { title });
        let outcome: LocateResult;
        try {
            outcome = await search();
        } finally {
            this.rpc.notify(METHODS.notifierProgressEnd, { title });
        }

        const located = classifyLocateResult(outcome);
        if (located.kind !== "ambiguous") {
            return { outcome, chosen: undefined };
        }

        // Sort by path so nearby files surface first. The bridge has no VS Code
        // `asRelativePath`, so the absolute path is both the detail and sort key.
        const sorted = [...located.paths].sort((a, b) => a.localeCompare(b));
        const selected = await this.show({
            placeholder: prompts.pickPlaceholder,
            canPickMany: false,
            items: sorted.map((path) => ({ label: posix.basename(path), description: path })),
        });
        return { outcome, chosen: selected === null ? undefined : sorted[selected[0]] };
    }
}

// IntelliJ's list popup shows no icons, so a choice travels without one.
function pickerShowParams<V>(prompt: ChoicePrompt<V>, canPickMany: boolean): PickerShowParams {
    return {
        title: prompt.title,
        placeholder: prompt.placeholder,
        canPickMany,
        items: prompt.items.map((item) => ({
            label: item.label,
            description: item.path ?? item.description,
        })),
    };
}

function valueAt<V>(prompt: ChoicePrompt<V>, index: number): V {
    const item = prompt.items[index];
    if (!item) {
        throw new Error(`picker/show chose index ${index} of prompt "${prompt.id}"`);
    }
    return item.value;
}
