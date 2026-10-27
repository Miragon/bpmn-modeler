import { BpmnDocument } from "../../kernel/domain/BpmnDocument";
import { FileNotFound, UserCancelledError } from "../../kernel/domain/errors";
import { getVersions } from "../../kernel/domain/engineVersions";
import {
    enginesIn,
    MigrationCandidate,
    MigrationPlan,
    MigrationVersions,
    PlannedWrite,
} from "../domain/MigrationPlan";
import { migrationSummary, WriteResult } from "../domain/migrationSummary";
import { MigrationPickerPort } from "../domain/ports";
import {
    DocumentPort,
    NotifierPort,
    PickerPort,
    WorkspacePort,
} from "../../kernel/domain/hostPorts";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";

interface CurrentDiagram {
    readonly document: BpmnDocument;
    readonly editorId: string | undefined;
}

/**
 * Workspace-wide migration of BPMN diagrams to a user-selected engine
 * version. Same-engine only — no cross-platform migration (C7↔C8).
 *
 * Lives apart from {@link import("../../modeler/bpmn/index").BpmnModelerService}
 * because the orchestration of picker/scope/version selection and bulk
 * file writes has no overlap with per-editor session management.
 */
export class BpmnMigrationService {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly vsWorkspace: WorkspacePort,
        private readonly picker: PickerPort & MigrationPickerPort,
        private readonly notifier: NotifierPort,
    ) {}

    async migrateAllDiagrams(): Promise<boolean> {
        try {
            const paths = await this.vsWorkspace.findFiles("**/*.bpmn");
            if (paths.length === 0) {
                this.notifier.showInfo("No BPMN files found in the workspace.");
                return false;
            }

            const plan = MigrationPlan.classify(await this.readCandidates(paths));
            const scopeDecision = plan.scopeDecision();
            if (scopeDecision.kind === "nothingToMigrate") {
                this.notifier.showInfo(
                    "Could not detect the engine for any BPMN file in the workspace.",
                );
                return false;
            }

            if (plan.undetected.length > 0) {
                this.notifier.logWarning(
                    `Skipped ${plan.undetected.length} file(s) with undetectable engine: ${plan.undetected.join(", ")}`,
                );
            }

            const scope =
                scopeDecision.kind === "ask"
                    ? await this.picker.pickMigrationScope(
                          scopeDecision.c7Count,
                          scopeDecision.c8Count,
                      )
                    : scopeDecision.scope;

            // Collect all input before any writes: document-change listeners
            // triggered by a write would steal focus and dismiss a subsequent
            // QuickPick.
            const versions: MigrationVersions = {};
            for (const engine of enginesIn(scope)) {
                versions[engine] = await this.picker.pickEngineVersion(engine, getVersions(engine));
            }

            const results: WriteResult[] = [];
            for (const plannedWrite of plan.writesFor(versions)) {
                results.push(await this.write(plannedWrite));
            }

            this.notifier.showInfo(migrationSummary(results));

            return true;
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    private async readCandidates(paths: readonly string[]): Promise<MigrationCandidate[]> {
        const candidates: MigrationCandidate[] = [];
        for (const path of paths) {
            const { document } = await this.readCurrentDiagram(path);
            candidates.push({ path, document });
        }
        return candidates;
    }

    /**
     * Files open in an editor are updated via {@link DocumentPort.write};
     * files only on disk are written via {@link WorkspacePort.writeFile}.
     */
    private async write(plannedWrite: PlannedWrite): Promise<WriteResult> {
        const { path } = plannedWrite;
        const current = await this.readCurrentDiagramIfPresent(path);
        if (current === undefined) {
            this.notifier.logWarning(`Skipped a diagram deleted during migration: ${path}`);
            return { kind: "skipped" };
        }

        const diagramWrite = plannedWrite.writeFrom(current.document);
        if (diagramWrite.kind === "unchanged") {
            return diagramWrite;
        }
        if (diagramWrite.kind === "engineChanged") {
            this.notifier.logWarning(
                `Skipped a diagram whose engine changed during migration: ${path}`,
            );
            return { kind: "skipped" };
        }

        if (current.editorId !== undefined) {
            // No revision: with one, IntelliJ skips its guard against external
            // edits not yet sent to the webview.
            if (!(await this.vsDocument.write(current.editorId, diagramWrite.xml))) {
                this.notifier.logWarning(
                    `Skipped a diagram whose editor rejected the update: ${path}`,
                );
                return { kind: "skipped" };
            }
        } else {
            await this.vsWorkspace.writeFile(path, diagramWrite.xml);
        }

        if (diagramWrite.stampedPlatform) {
            this.notifier.logWarning(`Added missing executionPlatform attribute to: ${path}`);
        }
        return { kind: "updated", write: plannedWrite };
    }

    /** An open editor's buffer is the diagram; its file on disk may be stale. */
    private async readCurrentDiagram(path: string): Promise<CurrentDiagram> {
        const editorId = this.editorStore.findEditorIdByPath(path);
        const content =
            editorId !== undefined
                ? this.vsDocument.getContent(editorId)
                : await this.vsWorkspace.readFile(path);
        return { document: new BpmnDocument(content), editorId };
    }

    private async readCurrentDiagramIfPresent(path: string): Promise<CurrentDiagram | undefined> {
        try {
            return await this.readCurrentDiagram(path);
        } catch (error) {
            if (error instanceof FileNotFound) {
                return undefined;
            }
            throw error;
        }
    }

    private handleError(error: Error): boolean {
        this.notifier.notifyError("A problem occurred while migrating BPMN diagrams.", error);
        return false;
    }
}
