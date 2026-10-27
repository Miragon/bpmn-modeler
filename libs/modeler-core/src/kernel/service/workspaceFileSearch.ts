import { matchesOutsideCommentsAndCdata } from "@miragon/bpmn-modeler-types";

import { EXCLUDED_DIRS, isInsideExcludedDirBelowEveryFolder } from "../domain/excludedDirs";
import { WorkspacePort } from "../domain/hostPorts";
import { SearchScope } from "../domain/searchScope";
import { joinWorkspacePath } from "../domain/workspacePath";

/**
 * Reusable workspace-search primitives shared by the navigation, code-link and
 * definition-search features. Kept in `kernel/` (exempt from feature isolation)
 * so these features build on one implementation of the find-files-with-fallback
 * and parallel content-search logic instead of duplicating ~80 lines each.
 *
 * `WorkspacePort` is an interface, so this module never imports `vscode` and
 * the layer-purity arch test (service must not import host modules) stays green.
 */

// Minimal logging surface — both `NotifierPort` and a bare stub satisfy it.
export interface SearchLogger {
    logInfo(message: string): void;
}

/**
 * Outcome of reading and matching a set of candidate files.
 *
 * `allUnreadable` is `true` only when at least one file was attempted and every
 * read failed, letting callers distinguish "searched, found nothing" from
 * "could not search because nothing was readable".
 */
export interface ContentSearchResult {
    matches: string[];
    readFailures: string[];
    allUnreadable: boolean;
}

/**
 * Escapes regex metacharacters so a user-supplied id / literal is matched
 * verbatim rather than interpreted as a pattern.
 */
export function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @returns `undefined` when there is nothing to search (no workspace folder and
 *   no source document to anchor a walk).
 */
export function resolveSearchScope(
    ws: WorkspacePort,
    sourceDocumentPath?: string,
): SearchScope | undefined {
    if (
        sourceDocumentPath !== undefined &&
        ws.findWorkspaceFolderForDocument(sourceDocumentPath) === undefined
    ) {
        return { kind: "loose-file", directory: ws.getDocumentDirectory(sourceDocumentPath) };
    }
    const folders = ws.getWorkspaceFolderPaths();
    return folders.length === 0 ? undefined : { kind: "workspace-folders", folders };
}

interface FindFilesOptions {
    logger?: SearchLogger;
    /**
     * Decides whether a file encountered during the fs-walk fallback is a
     * candidate. The `findFiles` path already filters by `glob`, so this is
     * only consulted on the walk paths (which enumerate every file).
     */
    matchesWalkedFile: (absolutePath: string) => boolean;
}

/**
 * Finds workspace files matching `glob`, excluding build/output dirs, with an
 * fs-walk fallback for hosts where the bundled ripgrep is missing.
 *
 * Strategy, in order:
 *   1. `workspace.findFiles(glob)` — fast (ripgrep-backed) and respects the
 *      user's `files.exclude` setting; results post-filtered by {@link EXCLUDED_DIRS}.
 *   2. fs-walk fallback — when (1) returns `[]` despite open folders, which
 *      happens in the unsigned electron-builder package where ripgrep is
 *      missing/unexecutable.
 *   3. fs-walk primary — for loose-file scenarios (document outside every folder).
 *
 * @returns the candidate absolute paths (possibly empty), or `undefined` when
 *   there is nothing to search (see {@link resolveSearchScope}).
 */
export async function findFilesExcluding(
    ws: WorkspacePort,
    glob: string,
    options: FindFilesOptions & { sourceDocumentPath?: string },
): Promise<string[] | undefined> {
    const scope = resolveSearchScope(ws, options.sourceDocumentPath);
    return scope && findFilesInScope(ws, scope, glob, options);
}

export async function findFilesInScope(
    ws: WorkspacePort,
    scope: SearchScope,
    glob: string,
    { logger, matchesWalkedFile }: FindFilesOptions,
): Promise<string[]> {
    if (scope.kind === "loose-file") {
        return walkWorkspaceTree(ws, scope.directory, matchesWalkedFile, logger, "walk-primary");
    }

    // Pass no excludes — VS Code layers the user's `files.exclude` and
    // `search.exclude` on top — then post-filter with EXCLUDED_DIRS because the
    // VS Code defaults do not cover all of them (dist, build, out, target, …).
    const startedAt = Date.now();
    const found = await ws.findFiles(glob);
    const filtered = found.filter(
        (path) => !isInsideExcludedDirBelowEveryFolder(path, scope.folders),
    );
    logger?.logInfo(
        `[search] findFiles("${glob}") returned ${found.length} path(s) ` +
            `(${filtered.length} after exclude filter) in ${Date.now() - startedAt}ms`,
    );
    if (filtered.length > 0) {
        return filtered;
    }

    // Fallback: findFiles failed silently (ripgrep missing in packaged .app).
    const walked = await Promise.all(
        scope.folders.map((root) =>
            walkWorkspaceTree(ws, root, matchesWalkedFile, logger, "walk-fallback"),
        ),
    );
    return [...new Set(walked.flat())];
}

/**
 * Parallel BFS over the directory tree. All directories at one depth are read
 * concurrently via `Promise.all` — sequential per-directory awaits cost several
 * seconds on deep workspaces. Unreadable subdirectories are swallowed.
 */
async function walkWorkspaceTree(
    ws: WorkspacePort,
    rootDir: string,
    matchesWalkedFile: (absolutePath: string) => boolean,
    logger: SearchLogger | undefined,
    reason: "walk-primary" | "walk-fallback",
): Promise<string[]> {
    logger?.logInfo(`[search] ${reason}: walking ${rootDir}`);
    const startedAt = Date.now();

    const out: string[] = [];
    let level: string[] = [rootDir];
    while (level.length > 0) {
        const reads = await Promise.all(
            level.map((dir) =>
                ws
                    .readDirectory(dir)
                    .then(
                        (entries) =>
                            [dir, entries] as [string, Array<[string, "file" | "directory"]>],
                    )
                    .catch(() => [dir, []] as [string, Array<[string, "file" | "directory"]>]),
            ),
        );
        const nextLevel: string[] = [];
        for (const [dir, entries] of reads) {
            for (const [name, type] of entries) {
                const full = joinWorkspacePath(dir, name);
                if (type === "directory") {
                    if (!EXCLUDED_DIRS.has(name)) {
                        nextLevel.push(full);
                    }
                } else if (matchesWalkedFile(full)) {
                    out.push(full);
                }
            }
        }
        level = nextLevel;
    }

    logger?.logInfo(
        `[search] ${reason} returned ${out.length} path(s) in ${Date.now() - startedAt}ms`,
    );
    return out;
}

/**
 * Reads each candidate file in parallel and tests `pattern` against its content
 * (ignoring XML comments and CDATA sections). Read failures are collected
 * rather than thrown so a single unreadable file does not abort the search.
 */
export async function searchFilesContent(
    ws: WorkspacePort,
    paths: string[],
    pattern: RegExp,
    logger?: SearchLogger,
): Promise<ContentSearchResult> {
    const startedAt = Date.now();
    const failures: string[] = [];
    const results = await Promise.all(
        paths.map(async (path) => {
            try {
                const content = await ws.readFile(path);
                return matchesOutsideCommentsAndCdata(content, pattern) ? path : undefined;
            } catch (error) {
                failures.push(`Could not read ${path}: ${(error as Error).message}`);
                return undefined;
            }
        }),
    );
    const matches = results.filter((path): path is string => path !== undefined);

    logger?.logInfo(
        `[search] content: candidates=${paths.length} matches=${matches.length} ` +
            `readFailures=${failures.length} reads-took=${Date.now() - startedAt}ms`,
    );

    return {
        matches,
        readFailures: failures,
        allUnreadable: paths.length > 0 && failures.length === paths.length,
    };
}
