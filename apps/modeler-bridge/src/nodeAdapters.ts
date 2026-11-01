/**
 * Pure-TypeScript, `vscode`-free implementations of {@link WorkspacePort} and
 * {@link SettingsPort}, backed directly by Node `fs`/`path`.
 *
 * The filesystem is a *Node* capability, not an IDE one. Because
 * {@link ArtifactService} and `BpmnElementTemplatesService` depend only on
 * these two ports, element templates are discovered, parsed, and live-reloaded
 * from the bridge with **zero** extra Kotlin RPC — the host only supplies the
 * workspace root.
 *
 * Path-space contract (the one subtlety):
 * `editorId` is a `file://` URI on both hosts. Two call paths reach this
 * adapter with *different* string spaces:
 *  - `setElementTemplates` resolves dirs via `DocumentPort.getFilePath` → a
 *    clean OS path (`fsPath`, no scheme).
 *  - `ArtifactService.createWatcher` does `posix.dirname(editorId)` → a
 *    URI-form path (`file:///…`), and watches the folder resolved for it.
 * So this adapter is **scheme-tolerant and space-preserving**: it strips a
 * leading `file://` only at the fs boundary, and returns the workspace root in
 * the *same* space as the queried document (URI in → URI out; clean in → clean
 * out). VS Code answers in the folder's spelling; {@link WorkspacePort} allows
 * both.
 *
 * Both hosts send system-independent, forward-slash paths (VS Code URIs and
 * IntelliJ's `VirtualFile.path`/`url`, which is always `/`-separated even on
 * Windows), so `posix.*` is the correct path algebra here — never the
 * platform-dependent `path.*`. Joins go through `joinWorkspacePath` instead of
 * `posix.join`, which drops the leading `//` of a UNC root.
 */

import { watch } from "chokidar";
import { promises as fs, watch as watchFs } from "node:fs";
import { join, posix, relative } from "node:path";

import {
    changedSettingKeys,
    coalesceWatcherEvents,
    ColorThemeSetting,
    coveredFolderRegExp,
    DirectoryNotFound,
    EditorSubscription,
    FileNotFound,
    globToRegExp,
    isWithinRoot,
    joinWorkspacePath,
    MarketplaceSettingsEntry,
    ModelerSettingsSnapshot,
    normalizeSettings,
    NoWorkspaceFolderFoundError,
    RawModelerSettings,
    relativeToRoot,
    SettingChange,
    settingChangeNaming,
    SettingKey,
    SettingsPort,
    toWorkspacePath,
    WatcherEventKind,
    withoutFileScheme,
    WorkspacePort,
} from "@miragon/bpmn-modeler-core";
import { SurfaceMode } from "@miragon/bpmn-modeler-types";

import { SeenPaths } from "./seenPaths";

/**
 * Node-`fs`-backed {@link WorkspacePort}. Only the methods on the element-
 * templates path are implemented; the rest throw, since the bridge type-checks
 * `src/**` and an unimplemented interface member would not compile.
 */
interface WatchSubscriber {
    onAdd(path: string): void;
    onChange(path: string): void;
    onUnlink(path: string): void;
}

interface SharedRootWatcher {
    watcher: { close(): unknown };
    subscribers: Set<WatchSubscriber>;
}

/**
 * Generated or tool-owned trees never hold templates, lint configs, forms or
 * worker sources, but can dwarf the sources on a big repo. Dot-dirs in general
 * must stay watched — templates live under `.camunda/`.
 */
const IGNORED_WATCH_DIRS = new Set([
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "dist",
    "build",
    "out",
    "target",
    "bin",
    "coverage",
    ".gradle",
    ".idea",
    ".angular",
]);

function isIgnoredWatchPath(root: string, path: string): boolean {
    return relative(root, path)
        .split(/[/\\]/)
        .some((segment) => IGNORED_WATCH_DIRS.has(segment));
}

function watchWithChokidar(root: string, emit: WatchSubscriber): { close(): unknown } {
    return watch(root, {
        ignoreInitial: true,
        ignored: (path: string) => isIgnoredWatchPath(root, path),
        usePolling: process.platform === "win32",
        interval: 300,
        binaryInterval: 300,
    })
        .on("add", emit.onAdd)
        .on("change", emit.onChange)
        .on("unlink", emit.onUnlink);
}

/**
 * chokidar calls `fs.watch` once per directory, and Bun backs every call on
 * macOS with its own FSEvents stream: on a repo with thousands of directories
 * arming them blocked the event loop for minutes and starved every RPC. A
 * single recursive watch is one stream, armed in milliseconds.
 */
function watchRecursivelyWithFsEvents(root: string, emit: WatchSubscriber): { close(): unknown } {
    // FSEvents reports create, rewrite and delete alike as `rename`, and a
    // birth time cannot tell a new path from a rewritten one: a move or a
    // timestamp-keeping copy brings an older one. So the first sighting of a
    // path counts as its create.
    const seenPaths = new SeenPaths();
    return watchFs(root, { recursive: true }, (_event, filename) => {
        if (!filename) {
            return;
        }
        const changed = join(root, filename);
        if (isIgnoredWatchPath(root, changed)) {
            return;
        }
        fs.stat(changed).then(
            () => {
                const isNew = !seenPaths.has(changed);
                seenPaths.add(changed);
                if (isNew) {
                    emit.onAdd(changed);
                } else {
                    emit.onChange(changed);
                }
            },
            () => {
                seenPaths.forget(changed);
                emit.onUnlink(changed);
            },
        );
    });
}

export class NodeWorkspace implements WorkspacePort {
    /**
     * Host-provided workspace roots, in whatever scheme space the host sent
     * them. Populated on `session/register`; consulted by
     * {@link getWorkspaceFolderForDocument} to mirror VS Code's nearest-first
     * discovery.
     */
    private readonly roots = new Map<string, number>();

    private readonly rootWatchers = new Map<string, SharedRootWatcher>();

    registerRoot(root: string): void {
        this.roots.set(root, (this.roots.get(root) ?? 0) + 1);
    }

    unregisterRoot(root: string): void {
        const count = this.roots.get(root);
        if (count === undefined) return;
        if (count <= 1) {
            this.roots.delete(root);
        } else {
            this.roots.set(root, count - 1);
        }
    }

    /**
     * Scheme-tolerant root match, shared by the throwing and non-throwing
     * variants below: returns the enclosing registered root re-prefixed into
     * `document`'s own scheme space (URI in → URI out, clean in → clean out),
     * or `undefined` when no root covers it.
     *
     * The innermost root wins regardless of registration order, as in VS Code:
     * an outer root would widen config and `.env` discovery to a tree the
     * document's own project does not own.
     */
    private enclosingRoot(document: string): string | undefined {
        const hadScheme = document.startsWith("file://");
        const documentPath = withoutFileScheme(document);
        let innermostRoot: string | undefined;
        for (const root of this.roots.keys()) {
            const rootPath = withoutFileScheme(root);
            const encloses = isWithinRoot(documentPath, rootPath);
            if (encloses && rootPath.length > (innermostRoot?.length ?? -1)) {
                innermostRoot = rootPath;
            }
        }
        if (innermostRoot === undefined) {
            return undefined;
        }
        return hadScheme ? "file://" + innermostRoot : innermostRoot;
    }

    /**
     * @throws {NoWorkspaceFolderFoundError} when no root encloses the document,
     *   so `ArtifactService.getWorkspaceRoot` falls back to git-root then doc-dir.
     */
    getWorkspaceFolderForDocument(document: string): string {
        const match = this.enclosingRoot(document);
        if (match === undefined) {
            throw new NoWorkspaceFolderFoundError();
        }
        return match;
    }

    /**
     * Lists direct children as `[name, "file"|"directory"]`. Entries that are
     * neither (symlinks, sockets, …) are dropped to match `VsCodeWorkspace`.
     *
     * @throws {DirectoryNotFound} on `ENOENT`/`ENOTDIR`. Load-bearing:
     *   `ArtifactService` catches it (via `instanceof`) to mean "no config dir
     *   here, keep walking" — hence the import from the package so the class
     *   identity survives bundling.
     */
    async readDirectory(path: string): Promise<[string, "file" | "directory"][]> {
        let dirents;
        try {
            dirents = await fs.readdir(withoutFileScheme(path), { withFileTypes: true });
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "ENOENT" || code === "ENOTDIR") {
                throw new DirectoryNotFound(path);
            }
            throw error;
        }
        return dirents.flatMap((entry): [string, "file" | "directory"][] => {
            if (entry.isFile()) {
                return [[entry.name, "file"]];
            }
            if (entry.isDirectory()) {
                return [[entry.name, "directory"]];
            }
            return [];
        });
    }

    /**
     * @throws {FileNotFound} on `ENOENT`. The {@link WorkspacePort.readFile}
     *   contract is "throw FileNotFound when absent" (VsCodeWorkspace already
     *   does, via `Uri.file`), and callers catch it (via `instanceof`) to mean
     *   "absent, use defaults". A raw ENOENT would slip that guard and rethrow —
     *   mirror the `readDirectory` precedent above so the class identity
     *   survives bundling.
     */
    async readFile(path: string): Promise<string> {
        try {
            return await fs.readFile(withoutFileScheme(path), "utf8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                throw new FileNotFound(path);
            }
            throw error;
        }
    }

    async isSymbolicLink(path: string): Promise<boolean> {
        try {
            return (await fs.lstat(withoutFileScheme(path))).isSymbolicLink();
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                return false;
            }
            throw error;
        }
    }

    /**
     * Keeps the {@link WorkspacePort.createWatcher} contract: fires the matching
     * handler for every changed path whose part below the root matches `glob`,
     * as VS Code's `RelativePattern` does, and debounces each path ~50ms so an
     * editor's multi-event save burst arrives as one event, coalesced by
     * `coalesceWatcherEvents`.
     *
     * Linux and Windows watch through chokidar: under Bun on Linux the
     * recursive mode of `fs.watch` only tracks the subdirectories that existed
     * when the watch began (fixed only in Bun ≥1.3.14). macOS uses one recursive
     * `fs.watch` instead, see {@link watchRecursivelyWithFsEvents}.
     *
     * {@link IGNORED_WATCH_DIRS} are pruned so arming the recursive watch on a
     * large repo stays within the OS watch-descriptor budget (inotify on Linux).
     */
    createWatcher(
        rootPath: string,
        glob: string,
        handlers: {
            onChange?: (path: string) => void;
            onCreate?: (path: string) => void;
            onDelete?: (path: string) => void;
        },
    ): { dispose(): void } {
        const root = withoutFileScheme(rootPath);
        const watchedRoot = toWorkspacePath(root);
        const matcher = globToRegExp(glob);

        const handlerFor: Record<WatcherEventKind, ((path: string) => void) | undefined> = {
            create: handlers.onCreate,
            change: handlers.onChange,
            delete: handlers.onDelete,
        };

        // Per-path timers, not one shared timer: the template handler reloads
        // everything on any event, so coalescing its burst is harmless — but code
        // link needs every distinct changed file. A single timer would drop all
        // but the last file of a multi-file burst (e.g. a branch checkout).
        const pending = new Map<string, { kind: WatcherEventKind; timer: NodeJS.Timeout }>();

        const deliverDebounced = (kind: WatcherEventKind, nativePath: string): void => {
            // chokidar emits OS-native paths; the core compares them with
            // `findFiles` results.
            const changed = toWorkspacePath(nativePath);
            const belowRoot = relativeToRoot(changed, watchedRoot);
            if (belowRoot === undefined || !matcher.test(belowRoot)) {
                return;
            }
            const earlier = pending.get(changed);
            clearTimeout(earlier?.timer);
            const coalesced = coalesceWatcherEvents(earlier?.kind, kind);
            pending.set(changed, {
                kind: coalesced,
                timer: setTimeout(() => {
                    pending.delete(changed);
                    handlerFor[coalesced]?.(changed);
                }, 50),
            });
        };

        const subscriber: WatchSubscriber = {
            onAdd: (p) => deliverDebounced("create", p),
            onChange: (p) => deliverDebounced("change", p),
            onUnlink: (p) => deliverDebounced("delete", p),
        };
        const shared = this.acquireRootWatcher(root);
        shared.subscribers.add(subscriber);

        return {
            dispose: (): void => {
                for (const { timer } of pending.values()) {
                    clearTimeout(timer);
                }
                pending.clear();
                this.releaseRootWatcher(root, subscriber);
            },
        };
    }

    /**
     * One watcher per root, fanned out to its subscribers: each consumer and
     * editor arming its own recursive watch multiplied the cost on a big repo.
     */
    private acquireRootWatcher(root: string): SharedRootWatcher {
        const existing = this.rootWatchers.get(root);
        if (existing) {
            return existing;
        }
        const subscribers = new Set<WatchSubscriber>();
        const emit: WatchSubscriber = {
            onAdd: (p) => subscribers.forEach((s) => s.onAdd(p)),
            onChange: (p) => subscribers.forEach((s) => s.onChange(p)),
            onUnlink: (p) => subscribers.forEach((s) => s.onUnlink(p)),
        };
        const watcher =
            process.platform === "darwin"
                ? watchRecursivelyWithFsEvents(root, emit)
                : watchWithChokidar(root, emit);
        const shared = { watcher, subscribers };
        this.rootWatchers.set(root, shared);
        return shared;
    }

    private releaseRootWatcher(root: string, subscriber: WatchSubscriber): void {
        const shared = this.rootWatchers.get(root);
        if (!shared) {
            return;
        }
        shared.subscribers.delete(subscriber);
        if (shared.subscribers.size === 0) {
            this.rootWatchers.delete(root);
            // chokidar's close() is async; nothing awaits teardown here.
            void shared.watcher.close();
        }
    }

    /**
     * Non-throwing variant of {@link getWorkspaceFolderForDocument} —
     * `ReferencedModelLocator` uses it to distinguish a workspace-rooted
     * document (use `findFiles`) from a loose file (walk from its directory).
     */
    findWorkspaceFolderForDocument(document: string): string | undefined {
        return this.enclosingRoot(document);
    }

    getWorkspaceFolderPaths(): string[] {
        return [...this.roots.keys()];
    }

    /**
     * Returns `posix.dirname` of the document, preserving the input's scheme
     * space so the locator's loose-file walk root and its candidate paths
     * compare consistently downstream.
     */
    getDocumentDirectory(document: string): string {
        const hadScheme = document.startsWith("file://");
        const parent = posix.dirname(withoutFileScheme(document));
        return hadScheme ? "file://" + parent : parent;
    }

    /**
     * Writes `content`, creating missing parent directories first. The mkdirp
     * mirrors `VsCodeWorkspace.writeFile`: the code-link artifact lands under a
     * nested `<configFolder>/code-link/<dir>/…` path that need not exist yet.
     */
    async writeFile(path: string, content: string): Promise<void> {
        const fsPath = withoutFileScheme(path);
        await fs.mkdir(posix.dirname(fsPath), { recursive: true });
        await fs.writeFile(fsPath, content, "utf8");
    }

    /**
     * Recursively removes `path`. `force: true` makes a missing directory a
     * no-op, mirroring `VsCodeWorkspace.deleteDirectory`, so pruning a cache slot
     * that was already deleted never throws.
     */
    async deleteDirectory(path: string): Promise<void> {
        await fs.rm(withoutFileScheme(path), { recursive: true, force: true });
    }

    /**
     * The absolute paths of the files below the registered workspace roots
     * whose path below their root matches `pattern`. Mirrors
     * `VsCodeWorkspace.findFiles`: `exclude` drops matches, `limit` caps the
     * result count.
     *
     * Walks with `readdir` rather than `fs.glob`: under Bun, `fs.glob` reads
     * every folder an exclude covers and follows symlinked folders.
     */
    async findFiles(pattern: string, exclude?: string | null, limit?: number): Promise<string[]> {
        const included = globToRegExp(pattern);
        const excluded = exclude ? globToRegExp(exclude) : undefined;
        const coveredFolder = exclude ? coveredFolderRegExp(exclude) : undefined;
        const results: string[] = [];
        for (const root of this.roots.keys()) {
            const rootDir = withoutFileScheme(root);
            const files = await listFilesBelow(
                rootDir,
                (folder) => coveredFolder?.test(folder) ?? false,
            );
            for (const relative of files) {
                if (!included.test(relative) || excluded?.test(relative)) {
                    continue;
                }
                results.push(joinWorkspacePath(rootDir, relative));
                if (limit !== undefined && results.length >= limit) {
                    return results;
                }
            }
        }
        return results;
    }
}

/**
 * The `/`-separated paths below `rootDir` of all but its folders, reading each
 * level's folders in parallel. A symlink counts as a file, so a symlinked
 * folder is never entered; dot-entries stay unlisted, as `fs.glob` leaves them.
 */
async function listFilesBelow(
    rootDir: string,
    skipsFolder: (relativeFolder: string) => boolean,
): Promise<string[]> {
    const files: string[] = [];
    let level = [""];
    while (level.length > 0) {
        const listings = await Promise.all(
            level.map(async (folder) => ({
                folder,
                entries: await fs.readdir(joinWorkspacePath(rootDir, folder), {
                    withFileTypes: true,
                }),
            })),
        );
        level = [];
        for (const { folder, entries } of listings) {
            for (const entry of entries) {
                if (entry.name.startsWith(".")) {
                    continue;
                }
                const relative = folder === "" ? entry.name : `${folder}/${entry.name}`;
                if (!entry.isDirectory()) {
                    files.push(relative);
                } else if (!skipsFolder(relative)) {
                    level.push(relative);
                }
            }
        }
    }
    return files;
}

/**
 * Mutable {@link SettingsPort} fed by the host over RPC, plus the change-event
 * hub the core's settings subscriptions ride on.
 *
 * The VS Code host reads configuration synchronously and emits
 * `onDidChangeConfiguration`; out-of-process there is no such API, so the host
 * instead pushes whole snapshots. {@link apply} diffs the incoming snapshot
 * against the current one and fires a host-agnostic {@link SettingChange} naming
 * only the keys that actually changed — exactly the contract
 * `BpmnSettingsBroadcaster` and the templates reload branch expect, which is what
 * lets the unmodified core react identically on both hosts.
 */
export class BridgeSettings implements SettingsPort {
    // Render-safe before the host's first snapshot, which a host may leave out of register.
    private snapshot: ModelerSettingsSnapshot = normalizeSettings({});
    private readonly listeners = new Set<(event: SettingChange) => void>();

    /**
     * Merges the host's values into the snapshot, read as every host reads them,
     * and notifies listeners for each key whose read value changed. Listeners
     * are registered per open editor via {@link onDidChange}, so one host frame
     * fans out to every session — mirroring VS Code's global config event.
     */
    apply(raw: RawModelerSettings): void {
        const next = normalizeSettings({ ...this.snapshot, ...raw });
        const changed = changedSettingKeys(this.snapshot, next);
        this.snapshot = next;
        this.notify(changed);
    }

    /** Registers a settings-change listener; the returned subscription unregisters it. */
    onDidChange(listener: (event: SettingChange) => void): EditorSubscription {
        this.listeners.add(listener);
        return {
            dispose: () => {
                this.listeners.delete(listener);
            },
        };
    }

    getConfigFolder(): string {
        return this.snapshot.configFolder;
    }
    getPersistCodeLinkMap(): boolean {
        return this.snapshot.persistCodeLinkMap;
    }
    getAlignToOrigin(): boolean {
        return this.snapshot.alignToOrigin;
    }
    getShowTransactionBoundaries(): boolean {
        return this.snapshot.showTransactionBoundaries;
    }
    getC8ApiVersion(): string {
        return this.snapshot.c8ApiVersion;
    }
    getColorTheme(): ColorThemeSetting {
        return this.snapshot.colorTheme;
    }
    getDefaultMode(): SurfaceMode {
        return this.snapshot.defaultMode;
    }
    getFavouriteBpmnElements(): string[] {
        return this.snapshot.favouriteBpmnElements;
    }
    getLanguage(): string {
        return this.snapshot.language;
    }
    getLintingEnabled(): boolean {
        return this.snapshot.lintingEnabled;
    }
    /**
     * Whether to ship the Camunda SPIN globals (`S`/`JSON`) and the
     * `SpinJsonNode` member table to the host. The gate lives here in the bridge
     * (single source) so the thin Kotlin completion contributor needs no toggle
     * of its own — an off setting simply makes the `script/open` payload carry
     * empty `globals`/`types`.
     */
    getScriptingSpin(): boolean {
        return this.snapshot.scriptingSpin;
    }
    getMarketplaces(): MarketplaceSettingsEntry[] {
        return this.snapshot.marketplaces;
    }

    private notify(changed: readonly SettingKey[]): void {
        if (changed.length === 0) {
            return;
        }
        const event = settingChangeNaming(changed);
        // Copy before iterating: a listener may dispose itself on fire.
        for (const listener of [...this.listeners]) {
            listener(event);
        }
    }
}
