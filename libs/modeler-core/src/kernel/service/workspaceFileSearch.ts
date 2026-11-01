import { matchesOutsideCommentsAndCdata } from "@miragon/bpmn-modeler-types";

import { excludedDirsGlob, isExcludedDirName } from "../domain/excludedDirs";
import { WorkspacePort } from "../domain/hostPorts";
import { LocateResult, outcomeAfterReading, SearchOutcome } from "../domain/locateResult";
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

interface FileScan<Found> {
    found: Found[];
    readFailures: string[];
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

/** The files a search lists: `glob` for `findFiles`, `matchesWalkedFile` for the walks. */
export interface WorkspaceFileQuery extends FindFilesOptions {
    glob: string;
    sourceDocumentPath?: string;
}

/**
 * Finds workspace files matching `glob` outside the excluded folders, with an
 * fs-walk fallback for hosts where the bundled ripgrep is missing.
 *
 * Strategy, in order:
 *   1. `workspace.findFiles(glob)` — fast (ripgrep-backed); the host skips
 *      the folders {@link excludedDirsGlob} names and, on VS Code, the user's
 *      `files.exclude`.
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
    query: WorkspaceFileQuery,
): Promise<string[] | undefined> {
    const scope = resolveSearchScope(ws, query.sourceDocumentPath);
    return scope && findFilesInScope(ws, scope, query.glob, query);
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

    // VS Code adds the user's `files.exclude` to this exclude, never
    // `search.exclude`.
    const startedAt = Date.now();
    const found = await ws.findFiles(glob, excludedDirsGlob());
    logger?.logInfo(
        `[search] findFiles("${glob}") returned ${found.length} path(s) in ${Date.now() - startedAt}ms`,
    );
    if (found.length > 0) {
        return found;
    }

    // Fallback: findFiles failed silently (ripgrep missing in packaged .app).
    const walked = await Promise.all(
        scope.folders.map((root) =>
            walkWorkspaceTree(ws, root, matchesWalkedFile, logger, "walk-fallback"),
        ),
    );
    return [...new Set(walked.flat())];
}

async function walkWorkspaceTree(
    ws: WorkspacePort,
    rootDir: string,
    matchesWalkedFile: (absolutePath: string) => boolean,
    logger: SearchLogger | undefined,
    reason: "walk-primary" | "walk-fallback",
): Promise<string[]> {
    logger?.logInfo(`[search] ${reason}: walking ${rootDir}`);
    const startedAt = Date.now();
    const out = await findFilesBelow(ws, rootDir, matchesWalkedFile);
    logger?.logInfo(
        `[search] ${reason} returned ${out.length} path(s) in ${Date.now() - startedAt}ms`,
    );
    return out;
}

/**
 * The files below `directory` that `matchesWalkedFile` accepts, skipping the
 * excluded folders ({@link isExcludedDirName}); none when `directory` is not a
 * readable directory.
 *
 * Parallel BFS over the directory tree. All directories at one depth are read
 * concurrently via `Promise.all` — sequential per-directory awaits cost several
 * seconds on deep workspaces. Unreadable subdirectories are swallowed.
 */
export async function findFilesBelow(
    ws: WorkspacePort,
    directory: string,
    matchesWalkedFile: (absolutePath: string) => boolean,
): Promise<string[]> {
    const out: string[] = [];
    let level: string[] = [directory];
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
                    if (!isExcludedDirName(name)) {
                        nextLevel.push(full);
                    }
                } else if (matchesWalkedFile(full)) {
                    out.push(full);
                }
            }
        }
        level = nextLevel;
    }
    return out;
}

/** The files `query` lists whose content matches `pattern` outside XML comments and CDATA sections. */
export function searchFilesContent(
    ws: WorkspacePort,
    query: WorkspaceFileQuery,
    pattern: RegExp,
): Promise<LocateResult> {
    return scanWorkspaceFiles(
        ws,
        query,
        (content, path) => (matchesOutsideCommentsAndCdata(content, pattern) ? path : undefined),
        (paths) => ({ paths }),
    );
}

/** Lists the files `query` names and keeps what `inspect` finds in each, gathered by `toMatches`. */
export async function scanWorkspaceFiles<Found, Matches extends object>(
    ws: WorkspacePort,
    query: WorkspaceFileQuery,
    inspect: (content: string, path: string) => Found | undefined,
    toMatches: (found: Found[]) => Matches,
): Promise<SearchOutcome<Matches>> {
    const paths = await findFilesExcluding(ws, query);
    if (paths === undefined) {
        query.logger?.logInfo("[search] no search scope (no folder, no source uri)");
        return { kind: "no-search-scope" };
    }

    const startedAt = Date.now();
    const { found, readFailures } = await scanFiles(ws, paths, inspect);
    query.logger?.logInfo(
        `[search] read: candidates=${paths.length} found=${found.length} ` +
            `readFailures=${readFailures.length} reads-took=${Date.now() - startedAt}ms`,
    );

    return outcomeAfterReading(paths.length, readFailures, toMatches(found));
}

/**
 * Reads each candidate in parallel and keeps what `inspect` finds in it. A
 * failed read is collected, not thrown, so one unreadable file does not abort
 * the search.
 */
async function scanFiles<Found>(
    ws: WorkspacePort,
    paths: readonly string[],
    inspect: (content: string, path: string) => Found | undefined,
): Promise<FileScan<Found>> {
    const readFailures: string[] = [];
    const inspected = await Promise.all(
        paths.map(async (path): Promise<[Found] | []> => {
            let content: string;
            try {
                content = await ws.readFile(path);
            } catch (error) {
                readFailures.push(`Could not read ${path}: ${(error as Error).message}`);
                return [];
            }
            const found = inspect(content, path);
            return found === undefined ? [] : [found];
        }),
    );
    return { found: inspected.flat(), readFailures };
}
