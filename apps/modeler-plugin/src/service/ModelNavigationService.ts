import { commands, Uri, workspace, WorkspaceConfiguration } from "vscode";

import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { VsCodeWorkspace } from "../infrastructure/VsCodeWorkspace";

/**
 * Folder names that are universally generated output, regardless of project
 * tooling.  Used as a fallback so a fresh workspace without a customised
 * `files.exclude` / `search.exclude` still hides build copies that would
 * otherwise produce phantom QuickPick entries.
 */
const NAVIGATION_BASELINE_EXCLUDES = [
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    "coverage",
    ".git",
    ".svn",
    ".hg",
];

/** Maximum length of a reference id echoed back into a user-facing notification. */
const REFERENCE_ID_DISPLAY_LIMIT = 100;

/**
 * Resolves a process or decision id to a workspace file and opens it in its
 * registered custom editor.  Triggered by
 * `NavigateToReferencedModelCommand` from the BPMN webview.
 */
export class ModelNavigationService {
    /**
     * @param vsWorkspace Workspace filesystem helper for `findFiles`/`readFile`.
     * @param vsUI User-facing notifications, logging, and QuickPick.
     */
    constructor(
        private readonly vsWorkspace: VsCodeWorkspace,
        private readonly vsUI: VsCodeUI,
    ) {}

    /**
     * Searches the workspace for a `.bpmn` / `.dmn` file that declares a
     * `process` / `decision` with the given id and opens it.
     *
     * - 0 matches → info notification.
     * - 1 match → open the file in its custom editor via `vscode.open`.
     * - ≥2 matches → QuickPick; on selection open the chosen file.
     *
     * @param referenceId The process / decision id to resolve.
     * @param kind `"process"` for Call Activities, `"decision"` for Business Rule Tasks.
     * @param sourceDocumentUri URI of the document the navigation was triggered
     *   from.  Used to scope `workspace.getConfiguration` so multi-root
     *   workspaces honour per-folder `files.exclude` / `search.exclude`.
     */
    async navigate(
        referenceId: string,
        kind: "process" | "decision",
        sourceDocumentUri?: Uri,
    ): Promise<void> {
        const glob = kind === "process" ? "**/*.bpmn" : "**/*.dmn";
        const pattern = buildIdRegex(referenceId, kind);
        const exclude = buildExcludeGlob(
            workspace.getConfiguration(undefined, sourceDocumentUri),
        );

        const paths = await this.vsWorkspace.findFiles(glob, exclude);

        let readFailures = 0;
        const results = await Promise.all(
            paths.map(async (path) => {
                try {
                    const xml = await this.vsWorkspace.readFile(path);
                    const stripped = stripXmlCommentsAndCdata(xml);
                    return pattern.test(stripped) ? path : undefined;
                } catch (error) {
                    readFailures++;
                    this.vsUI.logWarning(
                        `Could not read ${path} while resolving reference "${referenceId}": ${
                            (error as Error).message
                        }`,
                    );
                    return undefined;
                }
            }),
        );
        const matches = results.filter((path): path is string => path !== undefined);

        if (matches.length === 0) {
            const display = truncate(referenceId, REFERENCE_ID_DISPLAY_LIMIT);
            if (paths.length > 0 && readFailures === paths.length) {
                this.vsUI.showError(
                    `Could not search for "${display}" — none of the candidate files were readable.`,
                );
            } else {
                this.vsUI.showInfo(
                    `No model declaring "${display}" was found in the workspace.`,
                );
            }
            return;
        }

        const chosen =
            matches.length === 1
                ? matches[0]
                : await this.vsUI.pickReferencedModel(matches);
        if (!chosen) {
            return;
        }

        try {
            await commands.executeCommand("vscode.open", Uri.file(chosen));
        } catch (error) {
            this.vsUI.logError(error as Error);
            this.vsUI.showError(
                `Could not open ${chosen}: ${(error as Error).message}`,
            );
        }
    }
}

/**
 * Escapes regex metacharacters in user-supplied ids before embedding them in
 * a pattern.  Process / decision ids are XML NCName tokens in well-formed
 * files, but we cannot rely on that for arbitrary workspace content.
 */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes XML comments and CDATA sections so they cannot produce false
 * matches.  A commented-out `<!-- <bpmn:process id="X"/> -->` or a sample id
 * inside `<![CDATA[…]]>` should not count as a real declaration.
 *
 * Exported for use in tests.
 */
export function stripXmlCommentsAndCdata(xml: string): string {
    // Loop until the input stops changing.  A single regex pass can leave
    // a residual `<!--` when the input is an adversarial / pathological
    // nesting like `<!--<!---->-->` — flagged by CodeQL as "incomplete
    // multi-character sanitization".  Re-running until stable is the
    // recommended pattern.
    let previous: string;
    let current = xml;
    do {
        previous = current;
        current = current
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
    } while (current !== previous);
    return current;
}

/**
 * Builds a regex matching `<…:process id="X">` or `<…:decision id="X">`,
 * tolerating optional namespace prefixes, whitespace around `=`, and either
 * quote style.  The trailing `["']` anchor prevents accidental matches
 * against `"X-suffix"`.
 *
 * Note: the namespace-prefix character class is `[\w-]+`, which is narrower
 * than the full XML NCName production but covers every prefix that occurs in
 * practice (`bpmn`, `bpmn2`, `dmn`, `camunda`, `zeebe`, …).
 *
 * Exported for use in tests.
 */
export function buildIdRegex(
    referenceId: string,
    kind: "process" | "decision",
): RegExp {
    const tag = kind === "process" ? "process" : "decision";
    return new RegExp(
        `<(?:[\\w-]+:)?${tag}\\b[^>]*\\bid\\s*=\\s*["']${escapeRegex(referenceId)}["']`,
    );
}

/**
 * @internal
 *
 * Composes the exclude glob handed to `workspace.findFiles`.  Merges the
 * user's `files.exclude` and `search.exclude` settings with a baseline of
 * universally generated output dirs so that build copies of the source
 * BPMN/DMN files do not surface as duplicate matches.
 *
 * Re-read on every navigate call so a settings edit takes effect without
 * an extension reload.  Patterns containing `,` or `{` are skipped because
 * they would corrupt the brace-group VS Code consumes.
 *
 * Exported for use in tests.
 */
export function buildExcludeGlob(config: WorkspaceConfiguration): string {
    const filesExcl = config.get<Record<string, boolean>>("files.exclude", {});
    const searchExcl = config.get<Record<string, boolean>>("search.exclude", {});

    const fromSettings = [
        ...Object.entries(filesExcl),
        ...Object.entries(searchExcl),
    ]
        .filter(([pattern, enabled]) => enabled && isBraceSafe(pattern))
        .map(([pattern]) => pattern);

    const baseline = NAVIGATION_BASELINE_EXCLUDES.map((name) => `**/${name}/**`);

    const merged = Array.from(new Set([...fromSettings, ...baseline]));
    return `{${merged.join(",")}}`;
}

/**
 * A glob pattern is "brace-safe" if it doesn't itself contain `,`, `{`, or
 * `}` — any of which would unbalance the wrapping brace-group when
 * concatenated.  Disqualified patterns are dropped from the composed
 * exclude; the user loses that particular exclude entry, but the overall
 * navigation glob stays well-formed.
 */
function isBraceSafe(pattern: string): boolean {
    return (
        !pattern.includes(",") &&
        !pattern.includes("{") &&
        !pattern.includes("}")
    );
}

function truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
