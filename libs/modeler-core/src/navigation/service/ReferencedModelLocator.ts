import type { ReferenceKind } from "@miragon/bpmn-modeler-types";

import { NotifierPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { LocateResult, SearchOutcome } from "../../kernel/domain/locateResult";
import { referenceForDisplay } from "../../kernel/domain/truncateForDisplay";
import { scanWorkspaceFiles, WorkspaceFileQuery } from "../../kernel/service/workspaceFileSearch";
import { declaresReferencedModel } from "../domain/modelDeclaration";

export interface FormDeclaration {
    id: string;
    path: string;
}

export type FormDeclarationsResult = SearchOutcome<{ declarations: FormDeclaration[] }>;

/**
 * Locates BPMN, DMN, or form files that declare the requested top-level id.
 *
 * The workspace search itself (findFiles + fs-walk fallback, parallel content
 * search) lives in {@link scanWorkspaceFiles} under `kernel/`; what counts as a
 * declaration is {@link declaresReferencedModel}.
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
        namespace?: string,
    ): Promise<LocateResult> {
        const id = referenceForDisplay(referenceId);
        this.notifier.logInfo(
            `[nav] resolving ${kind} id="${id}"` +
                (namespace === undefined ? "" : ` namespace="${namespace}"`) +
                ` sourceUri=${sourceDocumentPath ?? "<none>"}`,
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
        const reference = { id: referenceId, kind, namespace };
        return scanWorkspaceFiles(
            this.vsWorkspace,
            this.filesEndingWith(extension, sourceDocumentPath),
            (content, path) => (declaresReferencedModel(content, reference) ? path : undefined),
            (paths) => ({ paths }),
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
