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
 *    URI-form path (`file:///…`), and its containment check compares against
 *    whatever {@link NodeWorkspace.getWorkspaceFolderForDocument} returns.
 * So this adapter must be **scheme-tolerant and space-preserving**: strip a
 * leading `file://` only at the fs boundary, and return the workspace root in
 * the *same* space as the queried document (URI in → URI out; clean in → clean
 * out). That invariant is what lets `ArtifactService` be reused verbatim across
 * both paths.
 *
 * Both hosts send system-independent, forward-slash paths (VS Code URIs and
 * IntelliJ's `VirtualFile.path`/`url`, which is always `/`-separated even on
 * Windows), so `posix.*` is the correct path algebra here — never the
 * platform-dependent `path.*`.
 */

import { watch } from "chokidar";
import { promises as fs } from "node:fs";
import { posix, sep } from "node:path";

import {
    DirectoryNotFound,
    EditorSubscription,
    NoWorkspaceFolderFoundError,
    SettingChange,
    SettingsPort,
    WorkspacePort,
} from "@miragon/bpmn-modeler-core";

/** Strips a leading `file://` so the string is a real OS path Node `fs` accepts. */
function toFsPath(path: string): string {
    return path.replace(/^file:\/\//, "");
}

/** Backslash-escapes every regex-special character in a literal glob run. */
function escapeRegExpLiteral(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles a glob into a path-matching `RegExp`. Two callers rely on it: the
 * `exclude` argument of {@link NodeWorkspace.findFiles} (Node's `fs.glob` accepts
 * the positive pattern natively, but its `exclude` option shape differs across
 * Node and Bun, so we match excluded paths ourselves to stay portable) and
 * {@link NodeWorkspace.createWatcher}, which honours its `glob` param this way.
 *
 * Supports the operators the callers use: a double-star (across path segments,
 * with a trailing slash swallowed so a leading double-star also matches at the
 * root), single `*` / `?` within one segment, and `{a,b,c}` brace alternation —
 * the code-link source glob (extensions `{java,kt,…}`) needs the last one.
 */
function globToRegExp(glob: string): RegExp {
    let re = "";
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === "*" && glob[i + 1] === "*") {
            re += ".*";
            i++;
            if (glob[i + 1] === "/") i++;
        } else if (c === "*") {
            re += "[^/]*";
        } else if (c === "?") {
            re += "[^/]";
        } else if (c === "{") {
            // `{a,b,c}` → `(?:a|b|c)`. An unterminated brace degrades to a literal
            // so a stray `{` can't produce an invalid regex.
            const end = glob.indexOf("}", i);
            if (end === -1) {
                re += "\\{";
            } else {
                const alternatives = glob.slice(i + 1, end).split(",");
                re += `(?:${alternatives.map(escapeRegExpLiteral).join("|")})`;
                i = end;
            }
        } else {
            re += escapeRegExpLiteral(c);
        }
    }
    return new RegExp(`^${re}$`);
}

/**
 * Node-`fs`-backed {@link WorkspacePort}. Only the methods on the element-
 * templates path are implemented; the rest throw, since the bridge type-checks
 * `src/**` and an unimplemented interface member would not compile.
 */
export class NodeWorkspace implements WorkspacePort {
    /**
     * Host-provided workspace roots, in whatever scheme space the host sent
     * them. Populated on `session/register`; consulted by
     * {@link getWorkspaceFolderForDocument} to mirror VS Code's nearest-first
     * discovery.
     */
    private readonly roots = new Set<string>();

    registerRoot(root: string): void {
        this.roots.add(root);
    }

    unregisterRoot(root: string): void {
        this.roots.delete(root);
    }

    /**
     * Scheme-tolerant root match, shared by the throwing and non-throwing
     * variants below: returns the enclosing registered root re-prefixed into
     * `document`'s own scheme space (URI in → URI out, clean in → clean out),
     * or `undefined` when no root covers it.
     */
    private enclosingRoot(document: string): string | undefined {
        const hadScheme = document.startsWith("file://");
        const normDoc = toFsPath(document);
        for (const root of this.roots) {
            const normRoot = toFsPath(root);
            if (normDoc === normRoot || normDoc.startsWith(normRoot + "/")) {
                return hadScheme ? "file://" + normRoot : normRoot;
            }
        }
        return undefined;
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
     * Walks upward from `startDir` for a directory containing `.git`. Ported
     * verbatim from `VsCodeWorkspace`; scheme handling is delegated to
     * {@link readDirectory}, so `current` stays in the caller's input space.
     */
    async findGitRoot(startDir: string): Promise<string | undefined> {
        let current = startDir;
        while (true) {
            try {
                const entries = await this.readDirectory(current);
                if (entries.some(([name]) => name === ".git")) {
                    return current;
                }
            } catch {
                return undefined;
            }
            const parent = posix.dirname(current);
            // dirname returns the same path at the filesystem root.
            if (parent === current) {
                return undefined;
            }
            current = parent;
        }
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
            dirents = await fs.readdir(toFsPath(path), { withFileTypes: true });
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

    async readFile(path: string): Promise<string> {
        return fs.readFile(toFsPath(path), "utf8");
    }

    /**
     * Watches the workspace root via chokidar, firing the matching handler for
     * every changed path that matches `glob`, debounced ~50ms to coalesce an
     * editor's multi-event save burst into one notification per file.
     *
     * Both watch consumers ride this one adapter: `ArtifactService` arms it with
     * the element-templates glob, and `CodeLinkMapService` with the source glob
     * (extensions `{java,kt,…}`). The `glob` argument is honoured — an earlier
     * version hardcoded the template pattern, which silently dropped every
     * code-link event.
     *
     * chokidar replaces `fs.watch({ recursive: true })`: the latter's recursive
     * mode is unreliable across platforms — under Bun on Linux it only tracks
     * subdirectories that existed when the watch began (fixed only in Bun
     * ≥1.3.14), so a freshly-created folder would go unnoticed. chokidar gives
     * version-independent recursive watching on macOS/Windows/Linux, matching
     * VS Code's `FileSystemWatcher` behaviour.
     *
     * `node_modules`/`.git` are pruned so arming the recursive watch on a large
     * repo stays within the OS watch-descriptor budget (inotify on Linux).
     * Dot-dirs in general must stay watched — templates live under `.camunda/`.
     *
     * On Windows the watch runs in polling mode (`usePolling`). chokidar v3 has
     * no native recursive Windows watch, so it opens a `ReadDirectoryChangesW`
     * handle per directory; that handle locks `element-templates` against moves
     * while a BPMN file is open (#1148). Polling via `fs.watchFile` holds no
     * directory handle, releasing the lock — Bun implements `fs.watchFile`, so
     * this works under the compiled bridge runtime.
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
        const root = toFsPath(rootPath);
        const matcher = globToRegExp(glob);

        // chokidar emits OS-native paths; normalise separators before matching
        // the glob, which is always forward-slash.
        const matches = (changed: string): boolean => matcher.test(changed.replace(/\\/g, "/"));

        // Per-path timers, not one shared timer: the template handler reloads
        // everything on any event, so coalescing its burst is harmless — but code
        // link needs every distinct changed file. A single timer would drop all
        // but the last file of a multi-file burst (e.g. a branch checkout).
        const timers = new Map<string, NodeJS.Timeout>();

        const fireDebounced = (
            handler: ((path: string) => void) | undefined,
            changed: string,
        ): void => {
            if (!handler || !matches(changed)) {
                return;
            }
            const pending = timers.get(changed);
            if (pending) {
                clearTimeout(pending);
            }
            timers.set(
                changed,
                setTimeout(() => {
                    timers.delete(changed);
                    handler(changed);
                }, 50),
            );
        };

        const watcher = watch(root, {
            // The initial load runs via the webview's `GetElementTemplatesCommand`;
            // skip the synthetic `add` storm chokidar emits for existing files.
            ignoreInitial: true,
            ignored: /(^|[/\\])(node_modules|\.git)([/\\]|$)/,
            // chokidar v3 has no native recursive watch on Windows, so it opens a
            // `ReadDirectoryChangesW` handle per directory — including
            // `element-templates`. That held handle makes Windows reject a `mv`
            // into the folder while a BPMN file is open (#1148). Polling uses
            // `fs.watchFile` (stat-based) and holds no directory handle, so the
            // lock disappears; the cost is bounded by the node_modules/.git prune.
            usePolling: process.platform === "win32",
            interval: 300,
            binaryInterval: 300,
        });
        watcher
            .on("add", (p) => fireDebounced(handlers.onCreate, p))
            .on("change", (p) => fireDebounced(handlers.onChange, p))
            .on("unlink", (p) => fireDebounced(handlers.onDelete, p));

        return {
            dispose(): void {
                for (const timer of timers.values()) {
                    clearTimeout(timer);
                }
                timers.clear();
                // chokidar's close() is async; nothing awaits teardown here.
                void watcher.close();
            },
        };
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
        return [...this.roots];
    }

    /**
     * Returns `posix.dirname` of the document, preserving the input's scheme
     * space so the locator's loose-file walk root and its candidate paths
     * compare consistently downstream.
     */
    getDocumentDirectory(document: string): string {
        const hadScheme = document.startsWith("file://");
        const parent = posix.dirname(toFsPath(document));
        return hadScheme ? "file://" + parent : parent;
    }

    /**
     * Writes `content`, creating missing parent directories first. The mkdirp
     * mirrors `VsCodeWorkspace.writeFile`: the code-link artifact lands under a
     * nested `<configFolder>/code-link/<dir>/…` path that need not exist yet.
     */
    async writeFile(path: string, content: string): Promise<void> {
        const fsPath = toFsPath(path);
        await fs.mkdir(posix.dirname(fsPath), { recursive: true });
        await fs.writeFile(fsPath, content, "utf8");
    }

    /**
     * Globs `pattern` across every registered workspace root, returning absolute
     * paths. Mirrors `VsCodeWorkspace.findFiles` for the picker's workspace-file
     * prompt: `exclude` drops matches, `limit` caps the result count.
     *
     * `fs.glob` is the Node/Bun built-in (no extra dependency); excluded paths
     * are filtered via {@link globToRegExp} for cross-runtime stability.
     */
    async findFiles(pattern: string, exclude?: string | null, limit?: number): Promise<string[]> {
        const excludeRe = exclude ? globToRegExp(exclude) : undefined;
        const results: string[] = [];
        for (const root of this.roots) {
            const cwd = toFsPath(root);
            for await (const match of fs.glob(pattern, { cwd })) {
                // fs.glob yields paths relative to cwd using the OS separator;
                // normalise to posix so the exclude matcher and join are stable.
                const relative = match.split(sep).join("/");
                if (excludeRe?.test(relative)) {
                    continue;
                }
                results.push(posix.join(cwd, relative));
                if (limit !== undefined && results.length >= limit) {
                    return results;
                }
            }
        }
        return results;
    }
}

/**
 * The full set of `miragon.bpmnModeler.*` values the core reads through
 * {@link SettingsPort}, as one host-pushed snapshot. The host (IntelliJ) is the
 * single source of truth and sends this on `session/register` and whenever the
 * user edits the Settings page; the bridge never reads configuration itself.
 */
export interface SettingsSnapshot {
    alignToOrigin: boolean;
    showTransactionBoundaries: boolean;
    configFolder: string;
    persistCodeLinkMap: boolean;
    c8ApiVersion: string;
    colorTheme: "automatic" | "light";
    favouriteBpmnElements: string[];
    language: string;
}

/** Mirrors the VS Code config prefix so `affectsConfiguration` keys line up across hosts. */
const SETTINGS_PREFIX = "miragon.bpmnModeler";

/**
 * Defaults matching `apps/vscode-plugin/package.json` so a session is render-safe
 * before the host's first snapshot arrives (a host that omits `settings`). In the
 * IntelliJ host these are immediately overwritten by the `ModelerSettingsStore`
 * snapshot seeded on register.
 */
const DEFAULT_SETTINGS: SettingsSnapshot = {
    alignToOrigin: false,
    showTransactionBoundaries: true,
    configFolder: ".camunda",
    persistCodeLinkMap: false,
    c8ApiVersion: "v2",
    colorTheme: "automatic",
    favouriteBpmnElements: [
        "bpmn:ServiceTask",
        "bpmn:UserTask",
        "bpmn:CallActivity",
        "bpmn:ExclusiveGateway",
    ],
    language: "en",
};

/**
 * Mutable {@link SettingsPort} fed by the host over RPC, plus the change-event hub
 * the core's settings subscriptions ride on.
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
    private snapshot: SettingsSnapshot = { ...DEFAULT_SETTINGS };
    private readonly listeners = new Set<(event: SettingChange) => void>();

    /**
     * Replaces the snapshot and notifies listeners for each changed key. Listeners
     * are registered per open editor via {@link onDidChange}, so one host frame
     * fans out to every session — mirroring VS Code's global config event.
     */
    apply(next: Partial<SettingsSnapshot>): void {
        const merged: SettingsSnapshot = { ...this.snapshot, ...next };
        const changed = new Set<string>();
        for (const key of Object.keys(merged) as (keyof SettingsSnapshot)[]) {
            if (!valuesEqual(this.snapshot[key], merged[key])) {
                changed.add(`${SETTINGS_PREFIX}.${key}`);
            }
        }
        this.snapshot = merged;
        if (changed.size === 0) {
            return;
        }
        const event: SettingChange = {
            affectsConfiguration: (section) => changed.has(section),
        };
        // Copy before iterating: a listener may dispose itself on fire.
        for (const listener of [...this.listeners]) {
            listener(event);
        }
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
    getColorTheme(): "automatic" | "light" {
        return this.snapshot.colorTheme;
    }
    getFavouriteBpmnElements(): string[] {
        return this.snapshot.favouriteBpmnElements;
    }
    getLanguage(): string {
        return this.snapshot.language;
    }
    /**
     * The host frame does not carry a SPIN toggle yet — globals and typed-member
     * resolution only reach IntelliJ in sub-phase 2d, where the bridge gains a
     * dedicated config. Until then the bridge mirrors the core's unconditional
     * default so no caller observes globals being silently suppressed.
     */
    getScriptingSpin(): boolean {
        return true;
    }
}

/** Order-sensitive equality covering the snapshot's primitives and the string-array field. */
function valuesEqual(a: unknown, b: unknown): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((value, index) => value === b[index]);
    }
    return a === b;
}
