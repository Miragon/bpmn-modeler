import { posix } from "path";

import { EXCLUDED_DIRS, pathIsInsideExcludedDir } from "../domain/excludedDirs";
import { WorkspacePort } from "../domain/hostPorts";

/**
 * Reusable workspace-search primitives shared by the navigation and code-link
 * features. Kept in `shared/` (exempt from feature isolation) so both features
 * build on one implementation of the find-files-with-fallback and parallel
 * content-search logic instead of duplicating ~80 lines each.
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
 *   there is nothing to search (no workspace folder and no source document to
 *   anchor a walk).
 */
export async function findFilesExcluding(
    ws: WorkspacePort,
    glob: string,
    options: {
        sourceDocumentPath?: string;
        logger?: SearchLogger;
        /**
         * Decides whether a file encountered during the fs-walk fallback is a
         * candidate. The `findFiles` path already filters by `glob`, so this is
         * only consulted on the walk paths (which enumerate every file).
         */
        matchesWalkedFile: (absolutePath: string) => boolean;
    },
): Promise<string[] | undefined> {
    const { sourceDocumentPath, logger, matchesWalkedFile } = options;

    const containingFolderPath =
        sourceDocumentPath !== undefined
            ? ws.findWorkspaceFolderForDocument(sourceDocumentPath)
            : undefined;
    const looseFile = sourceDocumentPath !== undefined && containingFolderPath === undefined;

    if (looseFile) {
        // No workspace folder covers the document → walk from its directory.
        const rootDir = ws.getDocumentDirectory(sourceDocumentPath!);
        return walkWorkspaceTree(ws, rootDir, matchesWalkedFile, logger, "walk-primary");
    }

    const folderPaths = ws.getWorkspaceFolderPaths();
    if (folderPaths.length === 0) {
        return undefined;
    }

    // Pass no excludes — VS Code layers the user's `files.exclude` and
    // `search.exclude` on top — then post-filter with EXCLUDED_DIRS because the
    // VS Code defaults do not cover all of them (dist, build, out, target, …).
    const startedAt = Date.now();
    const found = await ws.findFiles(glob);
    const filtered = found.filter((path) => !pathIsInsideExcludedDir(path));
    logger?.logInfo(
        `[search] findFiles("${glob}") returned ${found.length} path(s) ` +
            `(${filtered.length} after exclude filter) in ${Date.now() - startedAt}ms`,
    );
    if (filtered.length > 0) {
        return filtered;
    }

    // Fallback: findFiles failed silently (ripgrep missing in packaged .app).
    const walked = await Promise.all(
        folderPaths.map((root) =>
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
                const full = posix.join(dir, name);
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

/**
 * Returns true if `pattern` matches at least one position in `content` that is
 * not inside an XML comment or CDATA section — a commented-out declaration is
 * not a real one. For non-XML source files the comment/CDATA ranges are simply
 * empty, so matching behaves normally.
 *
 * Comment/CDATA ranges are enumerated via regex rather than stripped with
 * `.replace()` to avoid CodeQL's `js/incomplete-multi-character-sanitization`
 * rule (this is filtering, not sanitisation, so the lint is a false positive
 * but easier to dodge than appease).
 */
function matchesOutsideCommentsAndCdata(content: string, pattern: RegExp): boolean {
    const excluded: Array<[number, number]> = [];
    for (const re of [/<!--[\s\S]*?-->/g, /<!\[CDATA\[[\s\S]*?\]\]>/g]) {
        let m;
        while ((m = re.exec(content)) !== null) {
            excluded.push([m.index, m.index + m[0].length]);
        }
    }
    const global = new RegExp(
        pattern.source,
        pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
    );
    let match;
    while ((match = global.exec(content)) !== null) {
        if (!excluded.some(([s, e]) => match!.index >= s && match!.index < e)) {
            return true;
        }
    }
    return false;
}
