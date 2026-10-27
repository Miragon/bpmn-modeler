import type { ReferenceKind } from "@miragon/bpmn-modeler-types";

import { escapeRegExpLiteral } from "../../kernel/domain/escapeRegExpLiteral";
import { NotifierPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import { LocateResult, SearchOutcome } from "../../kernel/domain/locateResult";
import { referenceForDisplay } from "../../kernel/domain/truncateForDisplay";
import {
    scanWorkspaceFiles,
    searchFilesContent,
    WorkspaceFileQuery,
} from "../../kernel/service/workspaceFileSearch";

export interface FormDeclaration {
    id: string;
    path: string;
}

export type FormDeclarationsResult = SearchOutcome<{ declarations: FormDeclaration[] }>;

/**
 * Locates BPMN, DMN, or form files that declare the requested top-level id.
 *
 * The workspace search itself (findFiles + fs-walk fallback, parallel content
 * search) lives in {@link searchFilesContent} / {@link scanWorkspaceFiles}
 * under `kernel/`; this class only owns the model-specific glob and id lookup.
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
        const id = referenceForDisplay(referenceId);
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
        return searchFilesContent(
            this.vsWorkspace,
            this.filesEndingWith(extension, sourceDocumentPath),
            this.buildIdPattern(referenceId, kind),
        );
    }

    /** Parses every candidate `.form` once and returns its top-level non-empty id. */
    findFormDeclarations(sourceDocumentPath?: string): Promise<FormDeclarationsResult> {
        return scanWorkspaceFiles(
            this.vsWorkspace,
            this.filesEndingWith(".form", sourceDocumentPath),
            declarationIn,
            (declarations) => ({ declarations }),
        );
    }

    private filesEndingWith(
        extension: string,
        sourceDocumentPath: string | undefined,
    ): WorkspaceFileQuery {
        return {
            glob: `**/*${extension}`,
            sourceDocumentPath,
            logger: this.notifier,
            matchesWalkedFile: (path) => path.endsWith(extension),
        };
    }

    /**
     * Builds a regex matching `<…:process id="X">` or `<…:decision id="X">`.
     * Tolerates optional namespace prefixes (`bpmn:`, `dmn:`, `camunda:`, …),
     * whitespace around `=`, and either quote style.
     *
     * Edge-case alternative: `bpmn-moddle` / `dmn-moddle` parse the XML into
     * a typed AST so we could read `process.id` directly.  Not used here
     * because a per-file parse is 50-100× slower than this regex, which
     * matters across a 100-file workspace.
     */
    private buildIdPattern(referenceId: string, kind: Exclude<ReferenceKind, "form">): RegExp {
        return new RegExp(
            `<(?:[\\w-]+:)?${kind}\\b[^>]*\\bid\\s*=\\s*["']${escapeRegExpLiteral(referenceId)}["']`,
        );
    }
}

function declarationIn(content: string, path: string): FormDeclaration | undefined {
    try {
        const parsed = JSON.parse(content) as { id?: unknown };
        return typeof parsed.id === "string" && parsed.id.length > 0
            ? { id: parsed.id, path }
            : undefined;
    } catch {
        return undefined;
    }
}
