import { posix } from "path";

import { ImplementationStatusQuery } from "@miragon/bpmn-modeler-shared";
import { asyncDebounce, ImplementationEntry } from "@miragon/bpmn-modeler-types";

import { EditorHandle } from "../../editorSession/service/EditorHandle";
import {
    configArtifactLocation,
    ConfigArtifactLocation,
} from "../../kernel/domain/configArtifacts";
import { NotifierPort, SettingsPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import { EVERY_PATH_GLOB, watchedChangeOf } from "../../kernel/domain/watchedFiles";
import { WatcherEventKind } from "../../kernel/domain/watcherEvents";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { CreatedFolderWalks } from "../../kernel/service/CreatedFolderWalks";
import { parseMapJson } from "../domain/codeLinkArtifact";
import { CodeLink, CodeLinkMap, SourceFileChange } from "../domain/CodeLinkMap";
import { SOURCE_FILES } from "../domain/ImplementationReference";
import { ImplementationTarget } from "../domain/ImplementationTarget";
import { ImplementationLocator } from "./ImplementationLocator";
import { SourceIndex } from "./SourceIndex";

const CODE_LINK_AREA = "code-link";

// Long enough that a burst of saves collapses into one write, short enough that
// the artifact is fresh by the time anyone reads it.
const PERSIST_DEBOUNCE_MS = 2000;

/** Per-open-editor state: the map plus the bookkeeping that keeps writes and syncs serial. */
interface EditorState {
    map: CodeLinkMap;
    documentPath: string | undefined;
    documentFsPath: string | undefined;
    workspaceRoot: string | undefined;
    attachedRoot: string | undefined;
    attachPromise: Promise<void> | undefined;
    warmLoaded: boolean;
    // Substantive (timestamp-free) signature of the last artifact written, so an
    // unchanged map does not rewrite the file and churn `generatedAt`.
    lastWrittenSignature: string | undefined;
    // Per-editor debounced writer: a shared one would let two editors' resolve
    // sets cross-corrupt each other's files.
    persistDebounced: () => Promise<void>;
    // Serialises this editor's sync/watcher work so interleaved awaits can't
    // corrupt the map (two syncs, or a sync racing a file-change handler).
    tail: Promise<void>;
}

/** A workspace-root watcher shared by every diagram rooted there, ref-counted by editor. */
interface SourceWatcher {
    handle: { dispose(): void };
    createdFolders: CreatedFolderWalks;
    refCount: number;
}

/**
 * Owns the always-on activity→code map for every open BPMN editor.
 *
 * Driven by the webview: each {@link syncActivities} carries the diagram's
 * implementation references, which are diffed against the held map so only the
 * delta touches the filesystem — unchanged-and-resolved entries are verified
 * with a single read, new/changed ones are batch-resolved in one scan, removed
 * ones are dropped. The resolution status is pushed back for the context pad.
 *
 * A single ref-counted source-file watcher per workspace root keeps the map live
 * as code is written: a saved file is tested only against this map's entries
 * ({@link onSourceFileChanged}), linking an unresolved activity or unlinking a
 * broken one without re-scanning the workspace.
 *
 * Disk persistence is opt-in (`miragon.bpmnModeler.persistCodeLinkMap`): when on,
 * the map is loaded as a warm cache on first sync and written (debounced) after
 * changes; when off, everything above still works purely in memory.
 *
 * `service` layer — no `vscode`; host facilities arrive through ports.
 */
export class CodeLinkMapService {
    private readonly states = new Map<string, EditorState>();

    private readonly watchers = new Map<string, SourceWatcher>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly locator: ImplementationLocator,
        private readonly sourceIndex: SourceIndex,
        private readonly artifactSvc: ArtifactService,
        private readonly vsWorkspace: WorkspacePort,
        private readonly vsSettings: SettingsPort,
        private readonly notifier: NotifierPort,
        private readonly persistDebounceMs: number = PERSIST_DEBOUNCE_MS,
    ) {}

    /**
     * Reconciles the held map with the diagram's current implementation
     * references. Serialised per editor so concurrent posts can't interleave.
     */
    syncActivities(editorId: string, entries: readonly ImplementationEntry[]): Promise<void> {
        const state = this.getOrCreateState(editorId);
        const run = () => this.runSync(editorId, state, entries);
        // `.then(run, run)` so a rejected predecessor still lets this one run.
        state.tail = state.tail.then(run, run);
        return state.tail;
    }

    /**
     * Tests one changed source file against every open map rooted at `root`,
     * linking newly-implementing files and unlinking broken ones. O(changed
     * file): no workspace scan, just one (OS-cached) read of the file per
     * affected editor, taken inside each editor's serialized tail. A folder
     * created as a whole is walked for its source files.
     */
    async onSourceFileChanged(path: string, event: WatcherEventKind, root: string): Promise<void> {
        const change = watchedChangeOf(event, path, root, SOURCE_FILES.includes);
        if (change === "unrelated") {
            return;
        }

        const affected = [...this.states.entries()].filter(
            ([, state]) => state.attachedRoot === root,
        );
        if (affected.length === 0) {
            return;
        }
        if (change === "folderCreated") {
            return this.watchers.get(root)?.createdFolders.add(path);
        }

        // Queue synchronously and read fresh *inside* each editor's serialized
        // tail. Reading here (before queuing) let two rapid saves' reads resolve
        // out of order, so the apply that ran last could carry the older content
        // and wedge the map at a stale state. Reading at apply time keeps every
        // apply on current on-disk content, in event order.
        for (const [editorId, state] of affected) {
            const apply = () => this.applyFileChange(editorId, state, path, event);
            state.tail = state.tail.then(apply, apply);
        }
        await Promise.all(affected.map(([, state]) => state.tail));
    }

    /** Drops an editor's state and releases its share of the workspace-root watcher and source index. */
    disposeEditor(editorId: string): void {
        this.sourceIndex.release(editorId);
        const state = this.states.get(editorId);
        if (!state) {
            return;
        }
        this.states.delete(editorId);
        if (state.attachedRoot) {
            this.releaseWatcher(state.attachedRoot);
        }
    }

    /** Disposes every watcher and clears all state — called once on feature shutdown. */
    dispose(): void {
        for (const watcher of this.watchers.values()) {
            watcher.handle.dispose();
            watcher.createdFolders.dispose();
        }
        this.watchers.clear();
        this.states.clear();
        this.sourceIndex.dispose();
    }

    private async runSync(
        editorId: string,
        state: EditorState,
        entries: readonly ImplementationEntry[],
    ): Promise<void> {
        await this.attachToRoot(editorId, state);
        // Attach is a no-op-and-bail when the editor was disposed before this
        // sync ran (`attachedRoot` left unset). Continuing would resolve against
        // an undefined document path and push to a gone webview — abandon it.
        if (!state.attachedRoot) {
            return;
        }

        // Mark loaded only once the persist-on path has actually run. Setting it
        // unconditionally meant toggling `persistCodeLinkMap` on mid-session
        // never loaded the artifact; leaving the flag false while persist is off
        // costs only a cheap `persistEnabled()` check per sync.
        if (!state.warmLoaded && this.persistEnabled()) {
            await this.loadWarmCache(state);
            state.warmLoaded = true;
        }

        const plan = state.map.planSync(entries);
        const verified = plan.retained.applyVerification(await this.verifyLinks(plan.toVerify));
        // Closed while this sync waited: resolving now would register the
        // editor with the source index again, and nothing would release it.
        if (this.isClosed(editorId, state)) {
            return;
        }
        let map = verified.map;
        const toResolve = [...plan.toResolve, ...verified.toResolve];
        if (toResolve.length > 0) {
            const resolved = await this.locator.resolveMany(
                toResolve,
                state.documentFsPath,
                this.sourceIndex.sourcesFor(editorId, state.documentFsPath),
            );
            if (this.isClosed(editorId, state)) {
                return;
            }
            map = map.applyResolution(toResolve, resolved);
        }
        state.map = map;

        await this.pushStatus(editorId, state);
        if (this.persistEnabled()) {
            void state.persistDebounced();
        }
    }

    private async applyFileChange(
        editorId: string,
        state: EditorState,
        path: string,
        event: WatcherEventKind,
    ): Promise<void> {
        const change = await this.readChange(path, event);
        if (this.isClosed(editorId, state)) {
            return;
        }
        const { map, changed } = state.map.applyFileChange(change);
        if (!changed) {
            return;
        }
        state.map = map;
        await this.pushStatus(editorId, state);
        if (this.persistEnabled()) {
            void state.persistDebounced();
        }
    }

    /**
     * Read at execution time (within the per-editor tail) so the content
     * reflects the file as of *this* event's turn — see onSourceFileChanged.
     * A delete carries no content. The read is OS-cached and cheap.
     */
    private async readChange(path: string, event: WatcherEventKind): Promise<SourceFileChange> {
        if (event === "delete") {
            return { kind: "deleted", path };
        }
        try {
            return { kind: "written", path, content: await this.vsWorkspace.readFile(path) };
        } catch (error) {
            this.notifier.logDebug(
                `[code-link] changed file unreadable, keeping its links ${path}: ${(error as Error).message}`,
            );
            return { kind: "unreadable", path };
        }
    }

    /** The files of each link that still implement it, keyed by activity. */
    private async verifyLinks(links: readonly CodeLink[]): Promise<Map<string, string[]>> {
        const survivors = new Map<string, string[]>();
        for (const link of links) {
            survivors.set(link.activityId, await this.verifyEntry(link));
        }
        return survivors;
    }

    /** Confirms a link's files still implement it; returns the survivors. */
    private async verifyEntry(link: CodeLink): Promise<string[]> {
        const target = ImplementationTarget.of(link.kind, link.reference);
        const stillMatching: string[] = [];
        for (const path of link.paths) {
            let content: string;
            try {
                content = await this.vsWorkspace.readFile(path);
            } catch (error) {
                // Linked file gone or unreadable → drop it; re-resolution decides.
                // Debug: a source file disappearing mid-session is routine churn.
                this.notifier.logDebug(
                    `[code-link] linked file unreadable, dropping ${path}: ${(error as Error).message}`,
                );
                continue;
            }
            if (target.isImplementedBy(path, content)) {
                stillMatching.push(path);
            }
        }
        return stillMatching;
    }

    private async pushStatus(editorId: string, state: EditorState): Promise<void> {
        try {
            await this.editorStore.postMessage(
                editorId,
                new ImplementationStatusQuery(state.map.statusSnapshot()),
            );
        } catch (error) {
            // Usually the editor being hidden (no retainContextWhenHidden): the
            // webview re-syncs on reload, so the drop is recoverable — but it does
            // mean the context pad is briefly stale, so warn rather than whisper.
            this.notifier.logWarning(
                `[code-link] status push skipped: ${(error as Error).message}`,
            );
        }
    }

    private attachToRoot(editorId: string, state: EditorState): Promise<void> {
        if (state.attachedRoot) {
            return Promise.resolve();
        }
        // Dedupe concurrent first syncs so the watcher is ref-counted once.
        if (!state.attachPromise) {
            // Never leave a rejected attach cached: clear it so a re-queued sync
            // retries instead of re-awaiting a permanently-rejected promise.
            state.attachPromise = this.doAttachToRoot(editorId, state).catch((error) => {
                state.attachPromise = undefined;
                throw error;
            });
        }
        return state.attachPromise;
    }

    private async doAttachToRoot(editorId: string, state: EditorState): Promise<void> {
        const handle = this.tryRequireHandle(editorId);
        if (!handle) {
            // The editor was disposed between this sync being queued and runSync
            // reaching attach (tail-chaining can delay it past the close).
            // Abandoning a sync for an editor being torn down is correct — drop
            // the orphan state so nothing stays wedged, and return without
            // throwing (an unawaited handler rejection would go unhandled).
            this.notifier.logInfo(
                `[code-link] editor ${editorId} disposed before attach; skipping sync`,
            );
            this.disposeEditor(editorId);
            return;
        }
        // Capture document paths now so persistence keeps working even if the
        // debounced write fires after the editor (and its handle) is gone.
        state.documentPath = handle.documentPath();
        state.documentFsPath = handle.documentFsPath();
        const root = await this.artifactSvc.getWorkspaceRoot(posix.dirname(state.documentPath));
        if (this.isClosed(editorId, state)) {
            return;
        }
        state.workspaceRoot = root;
        state.attachedRoot = root;
        this.acquireWatcher(root);
    }

    /** {@link EditorSessionStore.requireHandle} that yields `undefined` instead of throwing when the editor is gone. */
    private tryRequireHandle(editorId: string): EditorHandle | undefined {
        try {
            return this.editorStore.requireHandle(editorId);
        } catch {
            return undefined;
        }
    }

    private acquireWatcher(root: string): void {
        let watcher = this.watchers.get(root);
        if (!watcher) {
            const handle = this.vsWorkspace.createWatcher(root, EVERY_PATH_GLOB, {
                onCreate: (path) => void this.onSourceFileChanged(path, "create", root),
                onChange: (path) => void this.onSourceFileChanged(path, "change", root),
                onDelete: (path) => void this.onSourceFileChanged(path, "delete", root),
            });
            const createdFolders = new CreatedFolderWalks(
                this.vsWorkspace,
                SOURCE_FILES.includes,
                (files) =>
                    Promise.all(
                        files.map((file) => this.onSourceFileChanged(file, "create", root)),
                    ),
            );
            watcher = { handle, createdFolders, refCount: 0 };
            this.watchers.set(root, watcher);
        }
        watcher.refCount += 1;
    }

    private releaseWatcher(root: string): void {
        const watcher = this.watchers.get(root);
        if (!watcher) {
            return;
        }
        watcher.refCount -= 1;
        if (watcher.refCount <= 0) {
            watcher.handle.dispose();
            watcher.createdFolders.dispose();
            this.watchers.delete(root);
        }
    }

    private async loadWarmCache(state: EditorState): Promise<void> {
        const artifactPath = this.artifactLocation(state)?.path;
        if (!artifactPath) {
            return;
        }
        let raw: string;
        try {
            raw = await this.vsWorkspace.readFile(artifactPath);
        } catch (error) {
            // No prior artifact — cold open, the diff resolves everything. Debug
            // level: the first open of any diagram hits this, so it must not add
            // channel noise, but the path helps when persistence is misconfigured.
            this.notifier.logDebug(
                `[code-link] no warm cache at ${artifactPath}: ${(error as Error).message}`,
            );
            return;
        }
        const json = parseMapJson(raw);
        if (!json) {
            this.notifier.logWarning(
                `[code-link] ignoring unreadable warm cache at ${artifactPath}`,
            );
            return;
        }
        // Belt-and-suspenders: parseMapJson already rejects malformed entries, so
        // the build should never throw — but a warm cache must never crash the
        // open, so degrade to "no warm cache" (clean map) if it somehow does.
        try {
            state.map = CodeLinkMap.fromArtifact(json, state.workspaceRoot!);
        } catch (error) {
            state.map = CodeLinkMap.empty;
            this.notifier.logWarning(
                `[code-link] discarding malformed warm cache at ${artifactPath}: ${(error as Error).message}`,
            );
            return;
        }
        this.notifier.logInfo(
            `[code-link] warm cache: loaded ${state.map.links.length} entr(y/ies) from ${artifactPath}`,
        );
    }

    /**
     * Writes the artifact, skipping the write when the map's substantive content
     * is unchanged. Public so persistence can be asserted directly without
     * waiting on the debounce; production calls it through `persistDebounced`.
     */
    async writeArtifact(editorId: string): Promise<void> {
        try {
            const state = this.states.get(editorId);
            if (!state || !state.workspaceRoot || !state.documentPath) {
                return; // Editor disposed before the debounced write fired.
            }
            const artifact = this.artifactLocation(state);
            if (!artifact) {
                return;
            }
            const json = state.map.toArtifact({
                bpmnFile: artifact.documentBelowRoot,
                generatedAt: "",
                workspaceRoot: state.workspaceRoot,
            });
            // Compare everything but the timestamp so an unchanged map is a no-op.
            const signature = JSON.stringify({ bpmnFile: json.bpmnFile, entries: json.entries });
            if (signature === state.lastWrittenSignature) {
                return;
            }
            state.lastWrittenSignature = signature;
            json.generatedAt = new Date().toISOString();
            await this.vsWorkspace.writeFile(artifact.path, JSON.stringify(json, null, 2));
        } catch (error) {
            this.notifier.logWarning(
                `[code-link] failed to persist map: ${(error as Error).message}`,
            );
        }
    }

    /** A document outside its root keeps its map in memory only. */
    private artifactLocation(state: EditorState): ConfigArtifactLocation | undefined {
        if (!state.workspaceRoot || !state.documentPath) {
            return undefined;
        }
        try {
            return configArtifactLocation({
                workspaceRoot: state.workspaceRoot,
                configFolder: this.vsSettings.getConfigFolder(),
                area: CODE_LINK_AREA,
                documentPath: state.documentPath,
                suffix: ".json",
            });
        } catch (error) {
            this.notifier.logWarning(
                `[code-link] not persisting the map: ${(error as Error).message}`,
            );
            return undefined;
        }
    }

    private getOrCreateState(editorId: string): EditorState {
        let state = this.states.get(editorId);
        if (!state) {
            state = {
                map: CodeLinkMap.empty,
                documentPath: undefined,
                documentFsPath: undefined,
                workspaceRoot: undefined,
                attachedRoot: undefined,
                attachPromise: undefined,
                warmLoaded: false,
                lastWrittenSignature: undefined,
                persistDebounced: asyncDebounce(
                    () => this.writeArtifact(editorId),
                    this.persistDebounceMs,
                ),
                tail: Promise.resolve(),
            };
            this.states.set(editorId, state);
        }
        return state;
    }

    private persistEnabled(): boolean {
        return this.vsSettings.getPersistCodeLinkMap();
    }

    /** Disposed, or disposed and reopened, while an await was pending. */
    private isClosed(editorId: string, state: EditorState): boolean {
        return this.states.get(editorId) !== state;
    }
}
