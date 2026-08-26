import { posix } from "path";

import { asyncDebounce, ImplementationStatusQuery } from "@miragon/bpmn-modeler-shared";
import {
    ImplementationEntry,
    ImplementationKind,
    implementationStatusKey,
} from "@miragon/bpmn-modeler-types";

import { EditorHandle } from "../../shared/domain/EditorSession";
import { pathIsInsideExcludedDir } from "../../shared/domain/excludedDirs";
import { NotifierPort, SettingsPort, WorkspacePort } from "../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";
import { ArtifactService } from "../../shared/service/ArtifactService";
import {
    buildMapJson,
    CodeLinkMapEntry,
    fileMatchesEntry,
    parseMapJson,
    toAbsoluteEntries,
    toRelative,
} from "../domain/CodeLinkMap";
import { JVM_EXTENSIONS, SCRIPT_WORKER_EXTENSIONS } from "../domain/ImplementationReference";
import { ImplementationLocator } from "./ImplementationLocator";

/** How a watched source file changed, as reported by the workspace watcher. */
type SourceChangeKind = "created" | "changed" | "deleted";

/** The implementation kinds the host knows how to resolve — a guard against a malformed message. */
const KNOWN_KINDS: ReadonlySet<ImplementationKind> = new Set<ImplementationKind>([
    "javaClass",
    "delegateExpression",
    "expression",
    "externalTopic",
    "jobType",
]);

// One watcher per workspace root covers every source language a worker/delegate
// can live in — the same extension set the locator scans.
const SOURCE_GLOB = `**/*.{${[...JVM_EXTENSIONS, ...SCRIPT_WORKER_EXTENSIONS].join(",")}}`;

// Subfolder of `<configFolder>` the artifact is written under.
const CODE_LINK_DIR = "code-link";

// Long enough that a burst of saves collapses into one write, short enough that
// the artifact is fresh by the time anyone reads it.
const PERSIST_DEBOUNCE_MS = 2000;

/** Per-open-editor state: the map plus the bookkeeping that keeps writes and syncs serial. */
interface EditorState {
    map: Map<string, CodeLinkMapEntry>;
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
        const valid = entries.filter((entry) => this.isValidEntry(entry));
        const state = this.getOrCreateState(editorId);
        const run = () => this.runSync(editorId, state, valid);
        // `.then(run, run)` so a rejected predecessor still lets this one run.
        state.tail = state.tail.then(run, run);
        return state.tail;
    }

    /**
     * Tests one changed source file against every open map rooted at `root`,
     * linking newly-implementing files and unlinking broken ones. O(changed
     * file): no workspace scan, just one (OS-cached) read of the file per
     * affected editor, taken inside each editor's serialized tail.
     */
    async onSourceFileChanged(
        path: string,
        changeKind: SourceChangeKind,
        root: string,
    ): Promise<void> {
        // The watcher glob carries no exclude, so a save under build output
        // (`target/`, `build/`, `dist/`, generated sources) still reaches here.
        // Skip it to match the batched scan, which already filters EXCLUDED_DIRS.
        if (pathIsInsideExcludedDir(path)) {
            return;
        }

        const affected = [...this.states.entries()].filter(
            ([, state]) => state.attachedRoot === root,
        );
        if (affected.length === 0) {
            return;
        }

        // Queue synchronously and read fresh *inside* each editor's serialized
        // tail. Reading here (before queuing) let two rapid saves' reads resolve
        // out of order, so the apply that ran last could carry the older content
        // and wedge the map at a stale state. Reading at apply time keeps every
        // apply on current on-disk content, in event order.
        for (const [editorId, state] of affected) {
            const apply = () => this.applyFileChange(editorId, state, path, changeKind);
            state.tail = state.tail.then(apply, apply);
        }
        await Promise.all(affected.map(([, state]) => state.tail));
    }

    /** Drops an editor's state and releases its share of the workspace-root watcher. */
    disposeEditor(editorId: string): void {
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
        }
        this.watchers.clear();
        this.states.clear();
    }

    private async runSync(
        editorId: string,
        state: EditorState,
        entries: ImplementationEntry[],
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

        const incoming = new Map(entries.map((entry) => [entry.activityId, entry]));
        for (const activityId of [...state.map.keys()]) {
            if (!incoming.has(activityId)) {
                state.map.delete(activityId);
            }
        }

        const toResolve: ImplementationEntry[] = [];
        for (const entry of entries) {
            const existing = state.map.get(entry.activityId);
            const unchanged =
                existing && existing.kind === entry.kind && existing.reference === entry.reference;
            if (!unchanged) {
                toResolve.push(entry);
                continue;
            }
            // Unchanged + previously unresolved → leave it for the watcher to
            // link rather than re-scanning the workspace on every edit.
            if (!existing!.resolved) {
                continue;
            }
            const stillMatching = await this.verifyEntry(existing!);
            if (stillMatching.length > 0) {
                existing!.paths = stillMatching;
            } else {
                existing!.resolved = false;
                existing!.paths = [];
                toResolve.push(entry);
            }
        }

        if (toResolve.length > 0) {
            const resolved = await this.locator.resolveMany(toResolve, state.documentFsPath);
            for (const entry of toResolve) {
                const paths = resolved.get(entry.activityId) ?? [];
                state.map.set(entry.activityId, {
                    activityId: entry.activityId,
                    kind: entry.kind,
                    reference: entry.reference,
                    resolved: paths.length > 0,
                    paths,
                });
            }
        }

        await this.pushStatus(editorId, state);
        if (this.persistEnabled()) {
            void state.persistDebounced();
        }
    }

    private async applyFileChange(
        editorId: string,
        state: EditorState,
        path: string,
        changeKind: SourceChangeKind,
    ): Promise<void> {
        // Read at execution time (within the per-editor tail) so the content
        // reflects the file as of *this* event's turn — see onSourceFileChanged.
        // A delete carries no content. The read is OS-cached and cheap.
        let content: string | undefined;
        if (changeKind !== "deleted") {
            try {
                content = await this.vsWorkspace.readFile(path);
            } catch {
                content = undefined;
            }
        }

        let dirty = false;
        for (const entry of state.map.values()) {
            if (this.updateEntryForFileChange(entry, path, changeKind, content)) {
                dirty = true;
            }
        }
        if (!dirty) {
            return;
        }
        await this.pushStatus(editorId, state);
        if (this.persistEnabled()) {
            void state.persistDebounced();
        }
    }

    /**
     * Reconciles a single entry with one changed file. Returns whether the
     * entry's resolution or paths changed (so the caller knows to push/persist).
     */
    private updateEntryForFileChange(
        entry: CodeLinkMapEntry,
        path: string,
        changeKind: SourceChangeKind,
        content: string | undefined,
    ): boolean {
        if (changeKind === "deleted") {
            if (!entry.paths.includes(path)) {
                return false;
            }
            entry.paths = entry.paths.filter((existing) => existing !== path);
            if (entry.paths.length === 0) {
                entry.resolved = false;
            }
            return true;
        }

        const matches = fileMatchesEntry(entry.kind, entry.reference, path, content);
        const alreadyLinked = entry.paths.includes(path);

        if (entry.resolved) {
            if (alreadyLinked && !matches) {
                // The edit removed the binding (deleted annotation, renamed class).
                entry.paths = entry.paths.filter((existing) => existing !== path);
                if (entry.paths.length === 0) {
                    entry.resolved = false;
                }
                return true;
            }
            if (!alreadyLinked && matches) {
                entry.paths.push(path);
                return true;
            }
            return false;
        }

        // Unresolved activity, freshly-written implementation → link it (Case 2).
        if (matches) {
            entry.paths = [path];
            entry.resolved = true;
            return true;
        }
        return false;
    }

    /** Confirms an entry's linked files still implement it; returns the survivors. */
    private async verifyEntry(entry: CodeLinkMapEntry): Promise<string[]> {
        const stillMatching: string[] = [];
        for (const path of entry.paths) {
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
            if (fileMatchesEntry(entry.kind, entry.reference, path, content)) {
                stillMatching.push(path);
            }
        }
        return stillMatching;
    }

    private async pushStatus(editorId: string, state: EditorState): Promise<void> {
        const resolved: Record<string, boolean> = {};
        for (const entry of state.map.values()) {
            resolved[implementationStatusKey(entry.activityId, entry.reference)] = entry.resolved;
        }
        try {
            await this.editorStore.postMessage(editorId, new ImplementationStatusQuery(resolved));
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
            const handle = this.vsWorkspace.createWatcher(root, SOURCE_GLOB, {
                onCreate: (path) => void this.onSourceFileChanged(path, "created", root),
                onChange: (path) => void this.onSourceFileChanged(path, "changed", root),
                onDelete: (path) => void this.onSourceFileChanged(path, "deleted", root),
            });
            watcher = { handle, refCount: 0 };
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
            this.watchers.delete(root);
        }
    }

    private async loadWarmCache(state: EditorState): Promise<void> {
        const artifactPath = this.artifactPath(state);
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
            for (const entry of toAbsoluteEntries(json, state.workspaceRoot!)) {
                state.map.set(entry.activityId, entry);
            }
        } catch (error) {
            state.map.clear();
            this.notifier.logWarning(
                `[code-link] discarding malformed warm cache at ${artifactPath}: ${(error as Error).message}`,
            );
            return;
        }
        this.notifier.logInfo(
            `[code-link] warm cache: loaded ${state.map.size} entr(y/ies) from ${artifactPath}`,
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
            const artifactPath = this.artifactPath(state);
            if (!artifactPath) {
                return;
            }
            const entries = [...state.map.values()];
            const json = buildMapJson({
                bpmnFile: toRelative(state.documentPath, state.workspaceRoot),
                generatedAt: "",
                workspaceRoot: state.workspaceRoot,
                entries,
            });
            // Compare everything but the timestamp so an unchanged map is a no-op.
            const signature = JSON.stringify({ bpmnFile: json.bpmnFile, entries: json.entries });
            if (signature === state.lastWrittenSignature) {
                return;
            }
            state.lastWrittenSignature = signature;
            json.generatedAt = new Date().toISOString();
            await this.vsWorkspace.writeFile(artifactPath, JSON.stringify(json, null, 2));
        } catch (error) {
            this.notifier.logWarning(
                `[code-link] failed to persist map: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Artifact path mirrors the diagram's workspace-relative location under
     * `<configFolder>/code-link/` (e.g. `…/order.bpmn` →
     * `.camunda/code-link/…/order.bpmn.json`). Mirroring the path — rather than
     * using the bare basename — keeps two same-named diagrams in different
     * folders from clobbering one file.
     */
    private artifactPath(state: EditorState): string | undefined {
        if (!state.workspaceRoot || !state.documentPath) {
            return undefined;
        }
        const relBpmn = toRelative(state.documentPath, state.workspaceRoot);
        return posix.join(
            state.workspaceRoot,
            this.vsSettings.getConfigFolder(),
            CODE_LINK_DIR,
            `${relBpmn}.json`,
        );
    }

    private getOrCreateState(editorId: string): EditorState {
        let state = this.states.get(editorId);
        if (!state) {
            state = {
                map: new Map(),
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

    private isValidEntry(entry: ImplementationEntry): boolean {
        return (
            typeof entry.activityId === "string" &&
            entry.activityId.length > 0 &&
            typeof entry.reference === "string" &&
            entry.reference.length > 0 &&
            KNOWN_KINDS.has(entry.kind)
        );
    }
}
