import { createHash } from "crypto";
import { posix } from "path";

import {
    Disposable,
    Event,
    EventEmitter,
    FileSystemWatcher,
    Position,
    Range,
    RelativePattern,
    Uri,
    WorkspaceEdit,
    WorkspaceFolder,
    workspace,
} from "vscode";

import type {
    BpmnIqPort,
    BpmnIqRegisterOptions,
    BpmnIqSessionActive,
    BpmnIqSseEvent,
} from "../domain/bpmnIq/BpmnIqPort";
import type { BpmnIqSyncSnapshot } from "../domain/bpmnIq/BpmnIqState";
import type { GitInfo } from "../domain/bpmnIq/gitDetect";
import {
    decodeWorkspaceModelId,
    encodeWorkspaceModelId,
    isSafeRelPath,
} from "../domain/bpmnIq/pathUtils";
import type { BpmnIqWorkspaceMeta } from "../infrastructure/bpmnIq/BpmnIqWorkspaceConfig";
import type { VsCodeUI } from "../infrastructure/VsCodeUI";

const HEARTBEAT_INTERVAL_MS = 30_000;
const SSE_BACKOFF_INITIAL_MS = 1_000;
const SSE_BACKOFF_MAX_MS = 15_000;
const IGNORED_SEGMENTS = new Set(["node_modules", ".bpmn-iq", ".git"]);

export interface StartOptions {
    /** Workspace folder to sync (first folder is used when omitted). */
    folder: WorkspaceFolder;
    /** Workspace metadata (workspaceId, name) — loaded or newly created by the controller. */
    meta: BpmnIqWorkspaceMeta;
    /** When true, pull every remote model and overwrite local copies on startup. */
    hydrateOnStart: boolean;
    /**
     * Git context for the workspace, when the folder is inside a git repo.
     * Forwarded to the daemon so peers on the same `(repoId, branch)` share
     * a workspace, and surfaced in the status-bar tooltip.
     */
    gitInfo?: GitInfo | null;
}

/** Compute a hex SHA-256 digest for a UTF-8 string. */
function sha256(content: string): string {
    return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * Produces the POSIX, workspace-root-relative path of a file URI, or `null`
 * if the file is outside the workspace or hits an ignored segment.
 */
function toRelPath(folder: WorkspaceFolder, uri: Uri): string | null {
    const root = folder.uri.path;
    if (!uri.path.startsWith(root + "/")) return null;
    const rel = uri.path.slice(root.length + 1);
    if (rel.split("/").some((seg) => IGNORED_SEGMENTS.has(seg))) return null;
    if (!isSafeRelPath(rel)) return null;
    return rel;
}

/**
 * Orchestrator for the bpmn-iq collaborative sync.  Mirrors the upstream
 * `bpmn-iq` CLI agent (`apps/agent/src/{watcher,sse-sync,cli}.ts`), but uses
 * VS Code's native `FileSystemWatcher` and `workspace.fs` APIs so there is
 * no chokidar dependency and no separate long-lived process.
 *
 * Lifecycle:
 *   1. `start(opts)` registers the workspace, optionally hydrates, performs
 *      an initial push, then starts the watcher + SSE loop + heartbeat.
 *   2. `stop()` aborts the SSE loop, disposes the watcher, unregisters.
 *   3. `dispose()` (called on extension deactivation) runs `stop()`.
 */
export class BpmnIqSyncService implements Disposable {
    private readonly _onDidChangeState = new EventEmitter<BpmnIqSyncSnapshot>();

    readonly onDidChangeState: Event<BpmnIqSyncSnapshot> =
        this._onDidChangeState.event;

    private snapshot: BpmnIqSyncSnapshot = { status: "off" };

    private port: BpmnIqPort | null = null;

    private folder: WorkspaceFolder | null = null;

    private meta: BpmnIqWorkspaceMeta | null = null;

    private registerOpts: BpmnIqRegisterOptions | null = null;

    /** Last SHA the daemon is known to hold for each relPath (POSIX). */
    private readonly remoteSha = new Map<string, string>();

    /** relPaths whose next `onDidDelete` is caused by an SSE-driven remove. */
    private readonly ignoreNextUnlink = new Set<string>();

    private watcher: FileSystemWatcher | null = null;

    private heartbeatTimer: NodeJS.Timeout | null = null;

    private sseAbort: AbortController | null = null;

    private sseLoop: Promise<void> | null = null;

    constructor(
        private readonly portFactory: (baseUrl: string, workspaceId: string) => BpmnIqPort,
        private readonly vsUI: VsCodeUI,
    ) {}

    /** Current status snapshot. */
    getSnapshot(): BpmnIqSyncSnapshot {
        return this.snapshot;
    }

    get isRunning(): boolean {
        return this.snapshot.status !== "off";
    }

    async start(opts: StartOptions, daemonUrl: string): Promise<void> {
        if (this.isRunning) return;

        this.folder = opts.folder;
        this.meta = opts.meta;
        this.registerOpts = this.buildRegisterOptions(opts);
        this.port = this.portFactory(daemonUrl, opts.meta.workspaceId);

        this.setState({
            status: "connecting",
            workspaceId: opts.meta.workspaceId,
            workspaceName: opts.meta.name,
            branch: opts.gitInfo?.branch ?? opts.meta.branch,
            detail: daemonUrl,
        });

        try {
            await this.port.registerWorkspace(this.registerOpts);
        } catch (err) {
            this.setState({
                ...this.snapshot,
                status: "error",
                detail: `Register failed: ${(err as Error).message}`,
            });
            throw err;
        }

        if (opts.hydrateOnStart) {
            try {
                await this.hydrate(opts.folder);
            } catch (err) {
                this.vsUI.logError(err as Error);
            }
        }

        try {
            await this.initialPush(opts.folder);
        } catch (err) {
            this.vsUI.logError(err as Error);
        }

        this.startWatcher(opts.folder);
        this.startHeartbeat();
        this.startSseLoop();

        this.setState({
            ...this.snapshot,
            status: "syncing",
            modelCount: this.remoteSha.size,
            branch: opts.gitInfo?.branch ?? opts.meta.branch,
            detail: undefined,
        });
    }

    async stop(): Promise<void> {
        if (this.snapshot.status === "off") return;

        if (this.sseAbort) {
            this.sseAbort.abort();
            this.sseAbort = null;
        }
        if (this.sseLoop) {
            await this.sseLoop.catch(() => undefined);
            this.sseLoop = null;
        }
        if (this.watcher) {
            this.watcher.dispose();
            this.watcher = null;
        }
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        try {
            await this.port?.unregisterWorkspace();
        } catch (err) {
            this.vsUI.logError(err as Error);
        }

        this.remoteSha.clear();
        this.ignoreNextUnlink.clear();
        this.port = null;
        this.folder = null;
        this.meta = null;
        this.registerOpts = null;

        this.setState({ status: "off" });
    }

    private buildRegisterOptions(opts: StartOptions): BpmnIqRegisterOptions {
        const repoId = opts.gitInfo?.repoId ?? opts.meta.repoId;
        const repoSlug = opts.gitInfo?.repoSlug ?? opts.meta.repoSlug;
        const branch = opts.gitInfo?.branch ?? opts.meta.branch;
        return { name: opts.meta.name, repoId, repoSlug, branch };
    }

    dispose(): void {
        void this.stop();
        this._onDidChangeState.dispose();
    }

    /**
     * Push the currently active model/element to the daemon.  Best-effort:
     * errors are logged and swallowed so the editor never blocks on sync.
     */
    async setSessionActive(active: BpmnIqSessionActive | null): Promise<void> {
        if (!this.port) return;
        try {
            await this.port.setSessionActive(active);
        } catch (err) {
            this.vsUI.logError(err as Error);
        }
    }

    /**
     * Build the daemon model id for a workspace file path.  Returns `null`
     * if no workspace is registered or the file lives outside the synced root.
     */
    buildActiveModelId(editorPath: string): string | null {
        if (!this.folder || !this.meta) return null;
        const uri = Uri.file(editorPath);
        const rel = toRelPath(this.folder, uri);
        if (rel === null) return null;
        return encodeWorkspaceModelId(this.meta.workspaceId, rel);
    }

    // ─── Internals ──────────────────────────────────────────────────────────

    private setState(snap: BpmnIqSyncSnapshot): void {
        this.snapshot = snap;
        this._onDidChangeState.fire(snap);
    }

    private async hydrate(folder: WorkspaceFolder): Promise<void> {
        const { models } = await this.port!.listWorkspaceModels();
        for (const m of models) {
            if (!isSafeRelPath(m.relPath)) continue;
            this.remoteSha.set(m.relPath, m.sha256);
            await this.writeFromRemote(folder, m.relPath, m.xml, m.sha256);
        }
    }

    private async initialPush(folder: WorkspaceFolder): Promise<void> {
        const pattern = new RelativePattern(folder, "**/*.bpmn");
        const uris = await workspace.findFiles(pattern, "**/node_modules/**");
        for (const uri of uris) {
            const rel = toRelPath(folder, uri);
            if (rel === null) continue;
            try {
                const xml = (await workspace.fs.readFile(uri)).toString();
                const localSha = sha256(xml);
                if (this.remoteSha.get(rel) === localSha) continue;
                const sha = await this.port!.upsertModel(rel, xml);
                this.remoteSha.set(rel, sha);
                this.vsUI.logInfo(`[bpmn-iq] pushed ${rel} (sha=${sha.slice(0, 8)})`);
            } catch (err) {
                this.vsUI.logError(err as Error);
            }
        }
    }

    private startWatcher(folder: WorkspaceFolder): void {
        const pattern = new RelativePattern(folder, "**/*.bpmn");
        this.watcher = workspace.createFileSystemWatcher(pattern);
        this.watcher.onDidCreate((uri) => void this.onLocalUpsert(folder, uri));
        this.watcher.onDidChange((uri) => void this.onLocalUpsert(folder, uri));
        this.watcher.onDidDelete((uri) => void this.onLocalRemove(folder, uri));
    }

    private async onLocalUpsert(folder: WorkspaceFolder, uri: Uri): Promise<void> {
        if (!this.port) return;
        const rel = toRelPath(folder, uri);
        if (rel === null) return;
        try {
            const xml = (await workspace.fs.readFile(uri)).toString();
            const localSha = sha256(xml);
            if (this.remoteSha.get(rel) === localSha) return;
            const sha = await this.port.upsertModel(rel, xml);
            this.remoteSha.set(rel, sha);
            this.bumpModelCount();
            this.vsUI.logInfo(`[bpmn-iq] pushed ${rel} (sha=${sha.slice(0, 8)})`);
        } catch (err) {
            this.vsUI.logError(err as Error);
        }
    }

    private async onLocalRemove(folder: WorkspaceFolder, uri: Uri): Promise<void> {
        if (!this.port) return;
        const rel = toRelPath(folder, uri);
        if (rel === null) return;
        if (this.ignoreNextUnlink.delete(rel)) return;
        try {
            await this.port.removeModel(rel);
            this.remoteSha.delete(rel);
            this.bumpModelCount();
            this.vsUI.logInfo(`[bpmn-iq] removed ${rel}`);
        } catch (err) {
            this.vsUI.logError(err as Error);
        }
    }

    private startHeartbeat(): void {
        this.heartbeatTimer = setInterval(() => {
            void (async () => {
                try {
                    const ok = await this.port?.heartbeat();
                    if (ok === false) {
                        this.vsUI.logWarning(
                            `[bpmn-iq] workspace unknown to daemon — re-registering`,
                        );
                        if (this.registerOpts) {
                            await this.port?.registerWorkspace(this.registerOpts);
                        }
                    }
                } catch (err) {
                    this.vsUI.logError(err as Error);
                }
            })();
        }, HEARTBEAT_INTERVAL_MS);
        this.heartbeatTimer.unref?.();
    }

    private startSseLoop(): void {
        this.sseAbort = new AbortController();
        const signal = this.sseAbort.signal;
        this.sseLoop = (async () => {
            let backoff = SSE_BACKOFF_INITIAL_MS;
            while (!signal.aborted) {
                try {
                    await this.port!.streamEvents((ev) => this.handleSseEvent(ev), signal);
                    if (signal.aborted) return;
                    this.vsUI.logWarning("[bpmn-iq] SSE server closed connection");
                } catch (err) {
                    if (signal.aborted) return;
                    this.vsUI.logError(err as Error);
                    this.setState({
                        ...this.snapshot,
                        status: "error",
                        detail: `SSE: ${(err as Error).message}`,
                    });
                }
                await new Promise<void>((resolve) => {
                    const t = setTimeout(resolve, backoff);
                    signal.addEventListener("abort", () => {
                        clearTimeout(t);
                        resolve();
                    });
                });
                backoff = Math.min(backoff * 2, SSE_BACKOFF_MAX_MS);
                if (!signal.aborted) {
                    this.setState({
                        ...this.snapshot,
                        status: "syncing",
                        detail: undefined,
                    });
                }
            }
        })();
    }

    private async handleSseEvent(ev: BpmnIqSseEvent): Promise<void> {
        if (!this.folder || !this.port) return;
        if (ev.type === "model-removed") {
            if (!ev.modelId) return;
            const parsed = this.decodeModelId(ev.modelId);
            if (!parsed) return;
            await this.removeFromRemote(this.folder, parsed.relPath);
            this.bumpModelCount();
            return;
        }
        if (!ev.modelRef) return;
        if (this.remoteSha.get(ev.modelRef.relPath) === ev.modelRef.sha256) return;
        try {
            const full = await this.port.getModel(ev.modelRef.id);
            await this.writeFromRemote(
                this.folder,
                ev.modelRef.relPath,
                full.xml,
                full.sha256,
            );
            this.bumpModelCount();
        } catch (err) {
            this.vsUI.logError(err as Error);
        }
    }

    private decodeModelId(
        id: string,
    ): { workspaceId: string; relPath: string } | null {
        const decoded = decodeWorkspaceModelId(id);
        if (!decoded || decoded.workspaceId !== this.meta?.workspaceId) return null;
        return decoded;
    }

    private async writeFromRemote(
        folder: WorkspaceFolder,
        relPath: string,
        xml: string,
        sha: string,
    ): Promise<void> {
        if (!isSafeRelPath(relPath)) return;
        const absPath = posix.join(folder.uri.path, relPath);
        const uri = Uri.file(absPath);
        let localSha: string | undefined;
        try {
            const buf = await workspace.fs.readFile(uri);
            localSha = sha256(buf.toString());
        } catch {
            // File does not exist locally yet — treated as a create.
        }
        // Update remoteSha before writing so the watcher's echo is deduped.
        this.remoteSha.set(relPath, sha);
        if (localSha === sha) return;

        // If the doc is already open as a TextDocument, route the update
        // through a WorkspaceEdit so it goes through VS Code's text-document
        // machinery — the modeler's CustomTextEditorProvider then refreshes
        // the webview live via its existing onDidChangeTextDocument handler.
        // Otherwise fall back to a raw fs write.
        const openDoc = workspace.textDocuments.find(
            (d) => d.uri.toString() === uri.toString(),
        );
        if (openDoc) {
            const edit = new WorkspaceEdit();
            const end =
                openDoc.lineCount > 0
                    ? openDoc.lineAt(openDoc.lineCount - 1).range.end
                    : new Position(0, 0);
            edit.replace(uri, new Range(new Position(0, 0), end), xml);
            await workspace.applyEdit(edit);
            await openDoc.save();
        } else {
            await workspace.fs.createDirectory(Uri.file(posix.dirname(absPath)));
            await workspace.fs.writeFile(uri, Buffer.from(xml, "utf-8"));
        }
        this.vsUI.logInfo(`[bpmn-iq] pulled ${relPath} (sha=${sha.slice(0, 8)})`);
    }

    private async removeFromRemote(
        folder: WorkspaceFolder,
        relPath: string,
    ): Promise<void> {
        if (!isSafeRelPath(relPath)) return;
        const uri = Uri.file(posix.join(folder.uri.path, relPath));
        this.remoteSha.delete(relPath);
        this.ignoreNextUnlink.add(relPath);
        // Safety: clear the marker even if onDidDelete never fires.
        setTimeout(() => this.ignoreNextUnlink.delete(relPath), 2_000).unref?.();
        try {
            await workspace.fs.delete(uri);
            this.vsUI.logInfo(`[bpmn-iq] deleted ${relPath}`);
        } catch (err) {
            // File may already be gone — log at info level.
            this.vsUI.logInfo(
                `[bpmn-iq] delete failed for ${relPath}: ${(err as Error).message}`,
            );
        }
    }

    private bumpModelCount(): void {
        this.setState({
            ...this.snapshot,
            modelCount: this.remoteSha.size,
        });
    }
}
