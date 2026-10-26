import { posix } from "path";

import {
    type SearchWorkspaceDefinitionsCommand,
    WorkspaceDefinitionsQuery,
} from "@miragon/bpmn-modeler-shared";
import {
    DEFINITION_KINDS,
    matchesDefinitionQuery,
    type WorkspaceDefinition,
} from "@miragon/bpmn-modeler-types";

import type { DocumentPort, NotifierPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import { toWorkspacePath } from "../../kernel/domain/workspacePath";
import type { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";
import type { WorkspaceDefinitionIndex } from "./WorkspaceDefinitionIndex";

const MAX_RESULTS = 50;

/**
 * Answers the webview's search for messages, signals, errors and escalations
 * declared in the *other* models of the workspace.
 */
export class DefinitionSearchService {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly document: DocumentPort,
        private readonly workspace: WorkspacePort,
        private readonly index: WorkspaceDefinitionIndex,
        private readonly notifier: NotifierPort,
    ) {}

    async search(
        editorId: string,
        { requestId, kind, text }: SearchWorkspaceDefinitionsCommand,
    ): Promise<void> {
        let definitions: WorkspaceDefinition[] = [];
        let failed = false;
        try {
            definitions = await this.find(editorId, { kind, text });
        } catch (error) {
            failed = true;
            this.notifier.logError(error as Error);
        }
        await this.editorStore.postMessage(
            editorId,
            new WorkspaceDefinitionsQuery(requestId, definitions, failed),
        );
    }

    releaseEditor(editorId: string): void {
        this.index.releaseEditor(editorId);
    }

    private async find(
        editorId: string,
        query: Pick<SearchWorkspaceDefinitionsCommand, "kind" | "text">,
    ): Promise<WorkspaceDefinition[]> {
        if (!DEFINITION_KINDS.includes(query.kind) || typeof query.text !== "string") {
            throw new Error(`Invalid definition search: ${String(query.kind)}`);
        }
        const sourcePath = this.document.getFilePath(editorId);
        const models = await this.index.modelsFor(editorId, sourcePath);
        return models
            .filter(({ path }) => toWorkspacePath(path) !== toWorkspacePath(sourcePath))
            .flatMap(({ path, definitions }) => {
                const source = {
                    path: this.relativePath(path),
                    label: posix.basename(toWorkspacePath(path)),
                };
                return definitions
                    .filter((definition) => matchesDefinitionQuery(definition, query))
                    .map((definition) => ({ ...definition, source }));
            })
            .sort(
                (a, b) =>
                    (a.name ?? a.code ?? "").localeCompare(b.name ?? b.code ?? "") ||
                    a.source.path.localeCompare(b.source.path),
            )
            .slice(0, MAX_RESULTS);
    }

    private relativePath(path: string): string {
        const folder = this.workspace.findWorkspaceFolderForDocument(path);
        return folder === undefined
            ? toWorkspacePath(path)
            : posix.relative(toWorkspacePath(folder), toWorkspacePath(path));
    }
}
