import { posix } from "path";

import { Uri, workspace } from "vscode";

import { VsCodeUI } from "../../infrastructure/VsCodeUI";
import { VsCodeWorkspace } from "../../infrastructure/VsCodeWorkspace";

/**
 * Directory names that never contain user-authored process/decision sources.
 * Applied uniformly to both code paths: as a post-filter on the
 * `workspace.findFiles` result, and per-directory during the fs-walk
 * fallback.  VS Code's default `files.exclude` / `search.exclude` only
 * cover a subset of these (notably `**\/node_modules`), so we cannot rely
 * on the platform defaults alone.
 */
const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    "coverage",
    ".git",
    ".svn",
    ".hg",
]);

/** Max length of a reference id echoed back into a user-facing log line. */
const ID_DISPLAY_LIMIT = 100;

/**
 * Outcome of locating models that declare a process or decision id.
 *
 * - `no-search-scope` — nothing to search: no workspace folder open and no
 *   source URI to fall back to.
 * - `all-unreadable` — the search returned candidates but every read failed.
 * - `matches` — candidates were searched.  `paths` may be empty (nothing
 *   declared the id), or contain one or more absolute paths.
 */
export type LocateResult =
    | { kind: "no-search-scope" }
    | { kind: "all-unreadable"; attempted: number; failures: string[] }
    | { kind: "matches"; paths: string[]; readFailures: string[] };

/**
 * Locates BPMN/DMN files that declare a given `<process id="…">` or
 * `<decision id="…">`.
 *
 * Strategy, in order:
 *   1. `workspace.findFiles("**\/*.bpmn"|.dmn)` — fast (ripgrep-backed in
 *      Theia/VS Code) and respects the user's `files.exclude` setting.
 *   2. fs-walk fallback — kicks in when (1) returns `[]` despite a workspace
 *      folder being open, which happens in the unsigned electron-builder
 *      package where the bundled ripgrep is missing or unexecutable.  No
 *      ripgrep dependency.
 *   3. fs-walk primary — for loose-file scenarios (no workspace folder).
 */
export class ReferencedModelLocator {
    constructor(
        private readonly vsWorkspace: VsCodeWorkspace,
        private readonly vsUI: VsCodeUI,
    ) {}

    async findDeclaringFiles(
        referenceId: string,
        kind: "process" | "decision",
        sourceDocumentUri?: Uri,
    ): Promise<LocateResult> {
        const extension = kind === "process" ? ".bpmn" : ".dmn";
        const id = truncate(referenceId, ID_DISPLAY_LIMIT);
        this.vsUI.logInfo(
            `[nav] resolving ${kind} id="${id}" sourceUri=${sourceDocumentUri?.path ?? "<none>"}`,
        );

        const paths = await this.collectCandidateFiles(extension, sourceDocumentUri);
        if (paths === undefined) {
            this.vsUI.logInfo(`[nav] no search scope (no folder, no source uri)`);
            return { kind: "no-search-scope" };
        }
        return this.filterByIdDeclaration(paths, referenceId, kind);
    }

    /**
     * Phase 1.  Returns `undefined` when nothing can be searched (no source
     * URI and no workspace folder).  Otherwise returns the candidate paths.
     */
    private async collectCandidateFiles(
        extension: string,
        sourceDocumentUri: Uri | undefined,
    ): Promise<string[] | undefined> {
        const looseFile =
            sourceDocumentUri !== undefined &&
            workspace.getWorkspaceFolder(sourceDocumentUri) === undefined;

        if (looseFile) {
            // No workspace folder covers the document → walk from its dir.
            const rootDir = posix.dirname(sourceDocumentUri!.path);
            return this.walkWorkspaceTree(rootDir, extension, "walk-primary");
        }

        const folders = workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }

        // Pass undefined for excludes — VS Code layers user's `files.exclude`
        // and `search.exclude` on top.  We then post-filter with
        // `EXCLUDED_DIRS` because the VS Code defaults do not cover all of
        // them (e.g. `dist`, `build`, `out`, `target`, `coverage`).
        const startedAt = Date.now();
        const found = await this.vsWorkspace.findFiles(`**/*${extension}`);
        const filtered = found.filter((path) => !pathIsInsideExcludedDir(path));
        this.vsUI.logInfo(
            `[nav] findFiles returned ${found.length} path(s) ` +
                `(${filtered.length} after exclude filter) in ${Date.now() - startedAt}ms`,
        );
        if (filtered.length > 0) {
            return filtered;
        }

        // Fallback: findFiles failed silently (ripgrep missing in packaged .app).
        const root = this.pickWalkRoot(sourceDocumentUri);
        if (!root) return [];
        return this.walkWorkspaceTree(root, extension, "walk-fallback");
    }

    /**
     * Parallel BFS.  All directories at the same depth are read concurrently
     * via `Promise.all` — sequential per-directory awaits cost several
     * seconds on deep workspaces.  Unreadable subdirectories are swallowed.
     */
    private async walkWorkspaceTree(
        rootDir: string,
        extension: string,
        reason: "walk-primary" | "walk-fallback",
    ): Promise<string[]> {
        this.vsUI.logInfo(`[nav] ${reason}: walking ${rootDir} for ${extension}`);
        const startedAt = Date.now();

        const out: string[] = [];
        let level: string[] = [rootDir];
        while (level.length > 0) {
            const reads = await Promise.all(
                level.map((dir) =>
                    this.vsWorkspace
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
                        if (!EXCLUDED_DIRS.has(name)) nextLevel.push(full);
                    } else if (name.endsWith(extension)) {
                        out.push(full);
                    }
                }
            }
            level = nextLevel;
        }

        this.vsUI.logInfo(
            `[nav] ${reason} returned ${out.length} path(s) in ${Date.now() - startedAt}ms`,
        );
        return out;
    }

    /** Where to root the walk fallback.  Best-effort. */
    private pickWalkRoot(sourceDocumentUri: Uri | undefined): string | undefined {
        if (sourceDocumentUri) {
            const folder = workspace.getWorkspaceFolder(sourceDocumentUri);
            if (folder) return folder.uri.path;
        }
        const folders = workspace.workspaceFolders;
        if (folders && folders.length > 0) return folders[0].uri.path;
        if (sourceDocumentUri) return posix.dirname(sourceDocumentUri.path);
        return undefined;
    }

    /**
     * Phase 2.  Reads each candidate file in parallel and tests the id regex
     * against its content (ignoring XML comments and CDATA sections).
     */
    private async filterByIdDeclaration(
        paths: string[],
        referenceId: string,
        kind: "process" | "decision",
    ): Promise<LocateResult> {
        const pattern = this.buildIdPattern(referenceId, kind);
        const startedAt = Date.now();

        const failures: string[] = [];
        const results = await Promise.all(
            paths.map(async (path) => {
                try {
                    const xml = await this.vsWorkspace.readFile(path);
                    return this.matchesDeclaration(xml, pattern) ? path : undefined;
                } catch (error) {
                    failures.push(
                        `Could not read ${path} while resolving reference "${referenceId}": ${
                            (error as Error).message
                        }`,
                    );
                    return undefined;
                }
            }),
        );
        const matches = results.filter((path): path is string => path !== undefined);

        this.vsUI.logInfo(
            `[nav] candidates=${paths.length} matches=${matches.length} readFailures=${failures.length} reads-took=${Date.now() - startedAt}ms`,
        );

        if (paths.length > 0 && failures.length === paths.length) {
            return { kind: "all-unreadable", attempted: paths.length, failures };
        }
        return { kind: "matches", paths: matches, readFailures: failures };
    }

    /**
     * Builds a regex matching `<…:process id="X">` or `<…:decision id="X">`.
     * Tolerates optional namespace prefixes (`bpmn:`, `dmn:`, `camunda:`, …),
     * whitespace around `=`, and either quote style.
     *
     * Edge-case alternative: `bpmn-moddle` / `dmn-moddle` parse the XML into
     * a typed AST so we could read `process.id` directly.  Not used here
     * because (1) it isn't a `modeler-plugin` dep yet, (2) per-file parse is
     * 50-100× slower than this regex, which matters across a 100-file
     * workspace.
     */
    private buildIdPattern(referenceId: string, kind: "process" | "decision"): RegExp {
        const tag = kind === "process" ? "process" : "decision";
        return new RegExp(
            `<(?:[\\w-]+:)?${tag}\\b[^>]*\\bid\\s*=\\s*["']${escapeRegex(referenceId)}["']`,
        );
    }

    /**
     * Returns true if `pattern` matches at least one position in `xml` that
     * is not inside an XML comment or CDATA section — a commented-out
     * `<!-- <bpmn:process id="X"/> -->` is not a real declaration.
     *
     * We enumerate comment/CDATA ranges via regex rather than `.replace()`
     * them away to avoid CodeQL's `js/incomplete-multi-character-sanitization`
     * rule (this is filtering, not sanitisation, so the lint is a false
     * positive but easier to dodge than appease).
     */
    private matchesDeclaration(xml: string, pattern: RegExp): boolean {
        const excluded: Array<[number, number]> = [];
        for (const re of [/<!--[\s\S]*?-->/g, /<!\[CDATA\[[\s\S]*?\]\]>/g]) {
            let m;
            while ((m = re.exec(xml)) !== null) {
                excluded.push([m.index, m.index + m[0].length]);
            }
        }
        const global = new RegExp(
            pattern.source,
            pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`,
        );
        let match;
        while ((match = global.exec(xml)) !== null) {
            if (!excluded.some(([s, e]) => match!.index >= s && match!.index < e)) {
                return true;
            }
        }
        return false;
    }
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pathIsInsideExcludedDir(path: string): boolean {
    for (const segment of path.split("/")) {
        if (segment !== "" && EXCLUDED_DIRS.has(segment)) return true;
    }
    return false;
}

function truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
