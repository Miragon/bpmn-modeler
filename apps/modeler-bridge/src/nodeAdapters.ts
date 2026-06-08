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
 */

import { promises as fs, watch } from "node:fs";
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

/**
 * Compiles a glob into a path-matching `RegExp`. Used only to honour the
 * `exclude` argument of {@link NodeWorkspace.findFiles}: Node's `fs.glob`
 * accepts the positive pattern natively, but its `exclude` option shape differs
 * across Node and Bun, so we match excluded paths ourselves to stay portable.
 *
 * Supports the operators the callers use: a double-star (across path segments,
 * with a trailing slash swallowed so a leading double-star also matches at the
 * root), and single `*` / `?` within one segment.
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
        } else {
            re += c.replace(/[.+^${}()|[\]\\]/, "\\$&");
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
     * Returns the registered root that encloses `documentDir`, re-prefixed into
     * `documentDir`'s own scheme space so the caller's downstream string
     * comparisons (e.g. `ArtifactService`'s containment check) stay consistent.
     *
     * @throws {NoWorkspaceFolderFoundError} when no root encloses the document,
     *   so `ArtifactService.getWorkspaceRoot` falls back to git-root then doc-dir.
     */
    getWorkspaceFolderForDocument(document: string): string {
        const hadScheme = document.startsWith("file://");
        const normDoc = toFsPath(document);
        for (const root of this.roots) {
            const normRoot = toFsPath(root);
            if (normDoc === normRoot || normDoc.startsWith(normRoot + "/")) {
                return hadScheme ? "file://" + normRoot : normRoot;
            }
        }
        throw new NoWorkspaceFolderFoundError();
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
     * Recursive {@link watch} over the workspace root, firing `onChange`
     * whenever an element-template JSON changes. Debounced ~50ms to coalesce
     * the editor's multi-event save bursts into a single re-load.
     *
     * Recursive `fs.watch` is macOS/Windows only — Linux would need chokidar or
     * per-directory watches (tracked for the Linux release target).
     */
    createWatcher(
        rootPath: string,
        _glob: string,
        handlers: {
            onChange?: (path: string) => void;
            onCreate?: (path: string) => void;
            onDelete?: (path: string) => void;
        },
    ): { dispose(): void } {
        const root = toFsPath(rootPath);
        const fire = handlers.onChange ?? handlers.onCreate ?? handlers.onDelete;
        let timer: NodeJS.Timeout | undefined;

        const watcher = watch(root, { recursive: true }, (_event, filename) => {
            if (!filename) {
                return;
            }
            const name = filename.toString();
            // The glob targets `<configFolder>/element-templates/**/*.json`;
            // match its intent against the changed path's relative form.
            if (!name.includes("/element-templates/") || !name.endsWith(".json")) {
                return;
            }
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => fire?.(posix.join(root, name)), 50);
        });

        return {
            dispose(): void {
                if (timer) {
                    clearTimeout(timer);
                }
                watcher.close();
            },
        };
    }

    // Never reached on the element-templates path; the bridge type-checks
    // `src/**`, so the full interface must be present.
    findWorkspaceFolderForDocument(): string | undefined {
        throw new Error("not implemented in bridge");
    }
    getWorkspaceFolderPaths(): string[] {
        throw new Error("not implemented in bridge");
    }
    getDocumentDirectory(): string {
        throw new Error("not implemented in bridge");
    }
    writeFile(): Promise<void> {
        throw new Error("not implemented in bridge");
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
    c8ApiVersion: string;
    colorTheme: "automatic" | "light";
    favouriteBpmnElements: string[];
    language: string;
}

/** Mirrors the VS Code config prefix so `affectsConfiguration` keys line up across hosts. */
const SETTINGS_PREFIX = "miragon.bpmnModeler";

/**
 * Defaults matching `apps/modeler-plugin/package.json` so a session is render-safe
 * before the host's first snapshot arrives (e.g. the CLI bridge, or a host that
 * omits `settings`). In the IntelliJ host these are immediately overwritten by the
 * `MiranumSettings` snapshot seeded on register.
 */
const DEFAULT_SETTINGS: SettingsSnapshot = {
    alignToOrigin: false,
    showTransactionBoundaries: true,
    configFolder: ".camunda",
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
}

/** Order-sensitive equality covering the snapshot's primitives and the string-array field. */
function valuesEqual(a: unknown, b: unknown): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((value, index) => value === b[index]);
    }
    return a === b;
}
