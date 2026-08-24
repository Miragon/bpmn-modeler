import { NotifierPort, WorkspacePort } from "../../shared/domain/hostPorts";
import type { ReferenceKind } from "@miragon/bpmn-modeler-shared";
import {
    escapeRegex,
    findFilesExcluding,
    searchFilesContent,
} from "../../shared/service/workspaceFileSearch";

// Max length of a reference id echoed back into a user-facing log line.
const ID_DISPLAY_LIMIT = 100;

/**
 * Outcome of locating models that declare a process, decision, or form id.
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

export interface FormDeclaration {
    id: string;
    path: string;
}

export type FormDeclarationsResult =
    | { kind: "no-search-scope" }
    | { kind: "all-unreadable"; attempted: number; failures: string[] }
    | { kind: "matches"; declarations: FormDeclaration[]; readFailures: string[] };

/**
 * Locates BPMN, DMN, or form files that declare the requested top-level id.
 *
 * The workspace search itself (findFiles + fs-walk fallback, parallel content
 * search) lives in {@link findFilesExcluding} / {@link searchFilesContent}
 * under `shared/`; this class only owns the model-specific glob and id lookup.
 */
export class ReferencedModelLocator {
    constructor(
        private readonly vsWorkspace: WorkspacePort,
        private readonly notifier: NotifierPort,
    ) {}

    async findDeclaringFiles(
        referenceId: string,
        kind: ReferenceKind,
        sourceDocumentPath?: string,
    ): Promise<LocateResult> {
        const id = truncate(referenceId, ID_DISPLAY_LIMIT);
        this.notifier.logInfo(
            `[nav] resolving ${kind} id="${id}" sourceUri=${sourceDocumentPath ?? "<none>"}`,
        );

        if (kind === "form") {
            const result = await this.findFormDeclarations(sourceDocumentPath);
            if (result.kind !== "matches") return result;
            return {
                kind: "matches",
                paths: result.declarations
                    .filter((declaration) => declaration.id === referenceId)
                    .map((declaration) => declaration.path),
                readFailures: result.readFailures,
            };
        }

        const extension = kind === "process" ? ".bpmn" : ".dmn";
        const paths = await findFilesExcluding(this.vsWorkspace, `**/*${extension}`, {
            sourceDocumentPath,
            logger: this.notifier,
            matchesWalkedFile: (path) => path.endsWith(extension),
        });
        if (paths === undefined) {
            this.notifier.logInfo(`[nav] no search scope (no folder, no source uri)`);
            return { kind: "no-search-scope" };
        }

        const pattern = this.buildIdPattern(referenceId, kind);
        const { matches, readFailures, allUnreadable } = await searchFilesContent(
            this.vsWorkspace,
            paths,
            pattern,
            this.notifier,
        );
        if (allUnreadable) {
            return { kind: "all-unreadable", attempted: paths.length, failures: readFailures };
        }
        return { kind: "matches", paths: matches, readFailures };
    }

    /** Parses every candidate `.form` once and returns its top-level non-empty id. */
    async findFormDeclarations(sourceDocumentPath?: string): Promise<FormDeclarationsResult> {
        const paths = await findFilesExcluding(this.vsWorkspace, "**/*.form", {
            sourceDocumentPath,
            logger: this.notifier,
            matchesWalkedFile: (path) => path.endsWith(".form"),
        });
        if (paths === undefined) {
            return { kind: "no-search-scope" };
        }

        const readFailures: string[] = [];
        const declarations = (
            await Promise.all(
                paths.map(async (path): Promise<FormDeclaration | undefined> => {
                    let content: string;
                    try {
                        content = await this.vsWorkspace.readFile(path);
                    } catch (error) {
                        readFailures.push(`Could not read ${path}: ${(error as Error).message}`);
                        return undefined;
                    }

                    try {
                        const parsed = JSON.parse(content) as { id?: unknown };
                        return typeof parsed.id === "string" && parsed.id.length > 0
                            ? { id: parsed.id, path }
                            : undefined;
                    } catch {
                        return undefined;
                    }
                }),
            )
        ).filter((value): value is FormDeclaration => value !== undefined);

        if (paths.length > 0 && readFailures.length === paths.length) {
            return { kind: "all-unreadable", attempted: paths.length, failures: readFailures };
        }
        return { kind: "matches", declarations, readFailures };
    }

    /**
     * Builds a regex matching `<…:process id="X">` or `<…:decision id="X">`.
     * Tolerates optional namespace prefixes (`bpmn:`, `dmn:`, `camunda:`, …),
     * whitespace around `=`, and either quote style.
     *
     * Edge-case alternative: `bpmn-moddle` / `dmn-moddle` parse the XML into
     * a typed AST so we could read `process.id` directly.  Not used here
     * because (1) it isn't a `vscode-plugin` dep yet, (2) per-file parse is
     * 50-100× slower than this regex, which matters across a 100-file
     * workspace.
     */
    private buildIdPattern(referenceId: string, kind: "process" | "decision"): RegExp {
        const tag = kind === "process" ? "process" : "decision";
        return new RegExp(
            `<(?:[\\w-]+:)?${tag}\\b[^>]*\\bid\\s*=\\s*["']${escapeRegex(referenceId)}["']`,
        );
    }
}

function truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
