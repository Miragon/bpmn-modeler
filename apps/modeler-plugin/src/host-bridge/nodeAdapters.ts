/**
 * Pure-TypeScript, `vscode`-free implementations of {@link WorkspacePort} and
 * {@link SettingsPort}, backed directly by Node `fs`/`path`.
 *
 * This is the spike's key claim made concrete: the filesystem is a *Node*
 * capability, not an IDE one. Because {@link ArtifactService} and
 * `BpmnElementTemplatesService` depend only on these two ports, element
 * templates can be discovered, parsed, and live-reloaded from the bridge with
 * **zero** extra Kotlin RPC — the host only supplies the workspace root.
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
 * out). That invariant is what lets `ArtifactService` be reused 100% verbatim
 * across both paths.
 */

import { promises as fs, watch } from "node:fs";
import { posix } from "node:path";

import { DirectoryNotFound, NoWorkspaceFolderFoundError } from "../shared/domain/errors";
import { SettingsPort, WorkspacePort } from "../shared/domain/hostPorts";

/** Strips a leading `file://` so the string is a real OS path Node `fs` accepts. */
function toFsPath(path: string): string {
    return path.replace(/^file:\/\//, "");
}

/**
 * Node-`fs`-backed {@link WorkspacePort}. Only the methods on the element-
 * templates path are implemented; the rest throw, since the plugin type-checks
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
     *   here, keep walking" — hence the import from the shared `errors` module
     *   so the class identity survives bundling.
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
     * Recursive `fs.watch` is macOS/Windows only — accepted spike limitation;
     * Linux would need chokidar or per-directory watches.
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

    // Never reached on the element-templates path; the plugin type-checks
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
    findFiles(): Promise<string[]> {
        throw new Error("not implemented in bridge");
    }
}

/**
 * Minimal {@link SettingsPort}. Only `getConfigFolder` is exercised by the
 * templates path; the rest return sane, render-safe defaults so the bridge
 * never probes a VS Code-specific code path.
 */
export class NodeSettings implements SettingsPort {
    getConfigFolder(): string {
        return ".camunda";
    }
    getAlignToOrigin(): boolean {
        return true;
    }
    getShowTransactionBoundaries(): boolean {
        return true;
    }
    getC8ApiVersion(): string {
        return "";
    }
    // "light" avoids the "automatic" path that probes VS Code theme classes.
    getColorTheme(): "automatic" | "light" {
        return "light";
    }
    getFavouriteBpmnElements(): string[] {
        return [];
    }
    getLanguage(): string {
        return "en";
    }
}
