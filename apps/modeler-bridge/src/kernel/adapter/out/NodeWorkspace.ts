/**
 * Pure-TypeScript, `vscode`-free implementation of {@link WorkspacePort}, backed
 * directly by Node `fs`/`path`; `BridgeSettings` is its {@link SettingsPort}
 * sibling.
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
 *  - The element-template and `.bpmnlintrc` watchers resolve dirs via
 *    `getDocumentDirectory(editorId)`, which here keeps the URI form
 *    (`file:///…`), and watch the folder resolved for it.
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
import { Dirent, promises as fs, watch as watchFs } from "node:fs";
import { join, posix, relative } from "node:path";

import {
    coalesceWatcherEvents,
    coveredFolderRegExp,
    DirectoryNotFound,
    FileNotFound,
    globToRegExp,
    isIgnoredWatchDirName,
    isWithinRoot,
    joinWorkspacePath,
    NoWorkspaceFolderFoundError,
    relativeToRoot,
    toWorkspacePath,
    WatcherEventKind,
    withoutFileScheme,
    WorkspacePort,
} from "@miragon/bpmn-modeler-core";

import { SeenPaths } from "./seenPaths";
import { watchOnceFolderExists } from "./watchOnceFolderExists";
import { WorkspaceRoots } from "../../port/WorkspaceRoots";

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

function isIgnoredWatchPath(root: string, path: string): boolean {
    return relative(root, path).split(/[/\\]/).some(isIgnoredWatchDirName);
}

function platformWatchOptions() {
    return {
        usePolling: process.platform === "win32",
        interval: 300,
        binaryInterval: 300,
    };
}

function watchWithChokidar(root: string, emit: WatchSubscriber, reportExisting = false): { close(): unknown } {
    return watch(root, {
        // chokidar arms asynchronously: reporting its first scan also covers files written while it armed.
        ignoreInitial: !reportExisting,
        ignored: (path: string) => isIgnoredWatchPath(root, path),
        ...platformWatchOptions(),
    })
        .on("add", emit.onAdd)
        .on("change", emit.onChange)
        .on("unlink", emit.onUnlink);
}

function watchChildFolders(folder: string, onChange: () => void): { close(): unknown } {
    return watch(folder, { ignoreInitial: true, depth: 0, ...platformWatchOptions() })
        // A folder created while chokidar armed is part of its first scan and raises no addDir.
        .on("ready", onChange)
        .on("addDir", onChange)
        .on("unlinkDir", onChange)
        .on("error", onChange);
}

function isIgnoredWatchFolder(relativeFolder: string): boolean {
    return relativeFolder.split("/").some(isIgnoredWatchDirName);
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

export class NodeWorkspace implements WorkspacePort, WorkspaceRoots {
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
     * The folders {@link isIgnoredWatchDirName} names are pruned so arming the
     * recursive watch on a large repo stays within the OS watch-descriptor
     * budget (inotify on Linux).
     *
     * A root that does not exist yet is watched once it appears, see
     * {@link watchOnceFolderExists}; the files it already holds then arrive
     * as creates.
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
        const watcher = watchOnceFolderExists(root, {
            arm: (late) => {
                if (process.platform !== "darwin") {
                    return watchWithChokidar(root, emit, late);
                }
                const armed = watchRecursivelyWithFsEvents(root, emit);
                if (late) {
                    void listFilesBelow(root, isIgnoredWatchFolder).then((files) =>
                        files.forEach((file) => emit.onAdd(joinWorkspacePath(root, file))),
                    );
                }
                return armed;
            },
            watchChildren: watchChildFolders,
        });
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
     *
     * The write is atomic: bridges of several projects share one plugin cache
     * and serve its files while another bridge may be rewriting them.
     */
    async writeFile(path: string, content: string): Promise<void> {
        const fsPath = withoutFileScheme(path);
        await fs.mkdir(posix.dirname(fsPath), { recursive: true });
        await writeFileAtomically(fsPath, content);
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
     * `VsCodeWorkspace.findFiles`: `exclude` drops matches, and a root
     * registered inside another is left to its own walk.
     *
     * Walks with `readdir` rather than `fs.glob`: under Bun, `fs.glob` reads
     * every folder an exclude covers.
     */
    async findFiles(pattern: string, exclude?: string | null): Promise<string[]> {
        const included = globToRegExp(pattern);
        const excluded = exclude ? globToRegExp(exclude) : undefined;
        const coveredFolder = exclude ? coveredFolderRegExp(exclude) : undefined;
        const rootDirs = [...this.roots.keys()].map((root) => withoutFileScheme(root));
        const results: string[] = [];
        for (const rootDir of rootDirs) {
            const nestedRoots = rootDirs.flatMap((other) => {
                const below = relativeToRoot(other, rootDir);
                return below ? [below] : [];
            });
            const files = await listFilesBelow(
                rootDir,
                (folder) => nestedRoots.includes(folder) || (coveredFolder?.test(folder) ?? false),
            );
            for (const relative of files) {
                if (!included.test(relative) || excluded?.test(relative)) {
                    continue;
                }
                results.push(joinWorkspacePath(rootDir, relative));
            }
        }
        return results;
    }
}

let temporaryFileCount = 0;

/**
 * Writes a temporary sibling and renames it over the target, so a reader sees
 * the old or the new content, never a part. A link is resolved first, and the
 * replaced file's permission bits carried over, so neither is lost to the
 * rename.
 */
async function writeFileAtomically(fsPath: string, content: string): Promise<void> {
    // Windows' realpath answers with backslashes, which the posix split below would not see.
    const target = toWorkspacePath(await noneIfAbsent(() => fs.realpath(fsPath), fsPath));
    const replaced = await noneIfAbsent(() => fs.stat(target), undefined);
    const temporary = posix.join(
        posix.dirname(target),
        `.${posix.basename(target)}.${process.pid}.${++temporaryFileCount}.tmp`,
    );
    try {
        await fs.writeFile(temporary, content, "utf8");
        if (replaced) {
            await fs.chmod(temporary, replaced.mode & 0o7777);
        }
        await renameRetryingWhileLocked(temporary, target);
    } catch (error) {
        await fs.rm(temporary, { force: true });
        throw error;
    }
}

// Windows refuses to replace a file another process holds open without
// FILE_SHARE_DELETE (java.io, a virus scanner, an indexer) until it closes it.
const LOCKED_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const RENAME_RETRY_DELAYS_MS = [10, 30, 100, 300];

async function renameRetryingWhileLocked(from: string, to: string): Promise<void> {
    for (const delay of RENAME_RETRY_DELAYS_MS) {
        try {
            return await fs.rename(from, to);
        } catch (error) {
            if (!LOCKED_CODES.has((error as NodeJS.ErrnoException).code ?? "")) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
    await fs.rename(from, to);
}

async function noneIfAbsent<T>(read: () => Promise<T>, none: T): Promise<T> {
    try {
        return await read();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return none;
        }
        throw error;
    }
}

// A folder can vanish between its parent's listing and its own; a link can
// dangle or point at itself.
const UNREADABLE_CODES = new Set(["EACCES", "EPERM", "ENOENT", "ENOTDIR", "ELOOP"]);

async function noneIfUnreadable<T>(read: () => Promise<T>, none: T): Promise<T> {
    try {
        return await read();
    } catch (error) {
        if (UNREADABLE_CODES.has((error as NodeJS.ErrnoException).code ?? "")) {
            return none;
        }
        throw error;
    }
}

interface WalkedFolder {
    readonly relative: string;
    readonly real: string;
    readonly parent?: WalkedFolder;
}

type WalkStep =
    | { readonly kind: "file"; readonly relative: string }
    | { readonly kind: "folder"; readonly folder: WalkedFolder }
    | { readonly kind: "skip" };

const SKIP: WalkStep = { kind: "skip" };

/**
 * The `/`-separated paths below `rootDir` of all but its folders, reading each
 * level's folders in parallel and skipping one it cannot read. Follows a
 * symlinked folder, as VS Code does, unless the walk is already inside it.
 */
async function listFilesBelow(
    rootDir: string,
    skipsFolder: (relativeFolder: string) => boolean,
): Promise<string[]> {
    const rootReal = await noneIfUnreadable(() => fs.realpath(rootDir), undefined);
    if (rootReal === undefined) return [];
    const files: string[] = [];
    let level: WalkedFolder[] = [{ relative: "", real: rootReal }];
    while (level.length > 0) {
        const steps = await Promise.all(
            level.map((folder) => walkFolder(rootDir, folder, skipsFolder)),
        );
        level = [];
        for (const step of steps.flat()) {
            if (step.kind === "file") files.push(step.relative);
            else if (step.kind === "folder") level.push(step.folder);
        }
    }
    return files;
}

async function walkFolder(
    rootDir: string,
    folder: WalkedFolder,
    skipsFolder: (relativeFolder: string) => boolean,
): Promise<WalkStep[]> {
    const path = joinWorkspacePath(rootDir, folder.relative);
    const entries = await noneIfUnreadable(
        () => fs.readdir(path, { withFileTypes: true }),
        [] as Dirent[],
    );
    return Promise.all(entries.map((entry) => walkEntry(rootDir, folder, entry, skipsFolder)));
}

async function walkEntry(
    rootDir: string,
    parent: WalkedFolder,
    entry: Dirent,
    skipsFolder: (relativeFolder: string) => boolean,
): Promise<WalkStep> {
    const relative = parent.relative === "" ? entry.name : `${parent.relative}/${entry.name}`;
    const path = joinWorkspacePath(rootDir, relative);
    const isLink = entry.isSymbolicLink();
    const target = isLink ? await noneIfUnreadable(() => fs.stat(path), undefined) : entry;
    if (target === undefined) return SKIP;
    if (!target.isDirectory()) return { kind: "file", relative };
    if (skipsFolder(relative)) return SKIP;
    if (!isLink) {
        return {
            kind: "folder",
            folder: { relative, real: join(parent.real, entry.name), parent },
        };
    }
    const real = await noneIfUnreadable(() => fs.realpath(path), undefined);
    // A link back to a folder the walk came through would loop; ripgrep stops there too.
    if (real === undefined || isOnPathTo(parent, real)) return SKIP;
    return { kind: "folder", folder: { relative, real, parent } };
}

function isOnPathTo(folder: WalkedFolder, real: string): boolean {
    for (let current: WalkedFolder | undefined = folder; current; current = current.parent) {
        if (current.real === real) return true;
    }
    return false;
}
