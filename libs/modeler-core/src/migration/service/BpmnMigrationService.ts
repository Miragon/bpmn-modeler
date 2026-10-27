import { Engine } from "@miragon/bpmn-modeler-types";

import { BpmnDocument } from "../../shared/domain/BpmnDocument";
import { FileNotFound, UserCancelledError } from "../../shared/domain/errors";
import { getVersions } from "../../shared/domain/engineVersions";
import { BpmnFileEntry, MigrationPlan, MigrationScope } from "../domain/MigrationPlan";
import { MigrationPickerPort } from "../domain/ports";
import {
    DocumentPort,
    NotifierPort,
    PickerPort,
    WorkspacePort,
} from "../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";

interface CurrentDiagram {
    readonly document: BpmnDocument;
    readonly editorId: string | undefined;
}

interface VersionUpdateCounts {
    readonly updated: number;
    readonly skipped: number;
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

            const plan = await this.buildMigrationPlan(paths);
            if (plan.isEmpty()) {
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

            let scope: MigrationScope;
            if (plan.hasBothPlatforms()) {
                scope = await this.picker.pickMigrationScope(
                    plan.c7Files.length,
                    plan.c8Files.length,
                );
            } else if (plan.hasC7()) {
                scope = "c7";
            } else {
                scope = "c8";
            }

            // Collect all input before any writes: document-change listeners
            // triggered by a write would steal focus and dismiss a subsequent
            // QuickPick.
            let c7Version: string | undefined;
            let c8Version: string | undefined;

            if (scope === "c7" || scope === "both") {
                c7Version = await this.picker.pickEngineVersion("c7", getVersions("c7"));
            }
            if (scope === "c8" || scope === "both") {
                c8Version = await this.picker.pickEngineVersion("c8", getVersions("c8"));
            }

            const summaryParts: string[] = [];
            let skippedCount = 0;

            if (c7Version) {
                const c7 = await this.applyVersionUpdate(plan.c7Files, c7Version, "c7");
                skippedCount += c7.skipped;
                if (c7.updated > 0) {
                    summaryParts.push(`${c7.updated} diagram(s) to Camunda 7 (${c7Version})`);
                }
            }

            if (c8Version) {
                const c8 = await this.applyVersionUpdate(plan.c8Files, c8Version, "c8");
                skippedCount += c8.skipped;
                if (c8.updated > 0) {
                    summaryParts.push(`${c8.updated} diagram(s) to Camunda 8 (${c8Version})`);
                }
            }

            this.notifier.showInfo(this.summarize(summaryParts, skippedCount));

            return true;
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    private async buildMigrationPlan(paths: string[]): Promise<MigrationPlan> {
        const c7Files: BpmnFileEntry[] = [];
        const c8Files: BpmnFileEntry[] = [];
        const undetected: string[] = [];

        for (const filePath of paths) {
            const { document } = await this.readCurrentDiagram(filePath);
            try {
                const platform = document.detectPlatform();
                const entry: BpmnFileEntry = { path: filePath, platform };
                if (platform === "c7") {
                    c7Files.push(entry);
                } else {
                    c8Files.push(entry);
                }
            } catch {
                undetected.push(filePath);
            }
        }

        return new MigrationPlan(c7Files, c8Files, undetected);
    }

    /**
     * Files open in an editor are updated via {@link DocumentPort.write};
     * files only on disk are written via {@link VsCodeWorkspace.writeFile}.
     */
    private async applyVersionUpdate(
        files: readonly BpmnFileEntry[],
        targetVersion: string,
        platform: Engine,
    ): Promise<VersionUpdateCounts> {
        let updated = 0;
        let skipped = 0;

        for (const file of files) {
            const current = await this.readCurrentDiagramIfPresent(file.path);
            if (current === undefined) {
                this.notifier.logWarning(
                    `Skipped a diagram deleted during migration: ${file.path}`,
                );
                skipped++;
                continue;
            }
            const { document, editorId } = current;
            if (document.detectEngine() !== platform) {
                this.notifier.logWarning(
                    `Skipped a diagram whose engine changed during migration: ${file.path}`,
                );
                skipped++;
                continue;
            }

            const migration = document.migratedTo(platform, targetVersion);
            if (migration.kind === "unchanged") {
                continue;
            }

            if (editorId !== undefined) {
                // No revision: with one, IntelliJ skips its guard against external
                // edits not yet sent to the webview.
                if (!(await this.vsDocument.write(editorId, migration.document.xml))) {
                    this.notifier.logWarning(
                        `Skipped a diagram whose editor rejected the update: ${file.path}`,
                    );
                    skipped++;
                    continue;
                }
            } else {
                await this.vsWorkspace.writeFile(file.path, migration.document.xml);
            }

            if (migration.kind === "platformStamped") {
                this.notifier.logWarning(
                    `Added missing executionPlatform attribute to: ${file.path}`,
                );
            }
            updated++;
        }

        return { updated, skipped };
    }

    private summarize(updatedParts: readonly string[], skippedCount: number): string {
        const updated =
            updatedParts.length > 0 ? `Updated ${updatedParts.join(" and ")}.` : undefined;
        if (skippedCount === 0) {
            return updated ?? "All diagrams are already at the selected version.";
        }
        return `${updated ?? "No diagrams were updated."} Skipped ${skippedCount} diagram(s); see the log for details.`;
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
