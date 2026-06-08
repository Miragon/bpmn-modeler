import { Engine } from "@miragon/bpmn-modeler-shared";

import { BpmnDocument } from "../../shared/domain/BpmnDocument";
import { UserCancelledError } from "../../shared/domain/errors";
import { getVersions } from "../../shared/domain/engineVersions";
import { BpmnFileEntry, MigrationPlan, MigrationScope } from "../domain/MigrationPlan";
import {
    DocumentPort,
    NotifierPort,
    PickerPort,
    WorkspacePort,
} from "../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";

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
        private readonly picker: PickerPort,
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

            if (c7Version) {
                const c7Updated = await this.applyVersionUpdate(plan.c7Files, c7Version, "c7");
                if (c7Updated > 0) {
                    summaryParts.push(`${c7Updated} diagram(s) to Camunda 7 (${c7Version})`);
                }
            }

            if (c8Version) {
                const c8Updated = await this.applyVersionUpdate(plan.c8Files, c8Version, "c8");
                if (c8Updated > 0) {
                    summaryParts.push(`${c8Updated} diagram(s) to Camunda 8 (${c8Version})`);
                }
            }

            if (summaryParts.length > 0) {
                this.notifier.showInfo(`Updated ${summaryParts.join(" and ")}.`);
            } else {
                this.notifier.showInfo("All diagrams are already at the selected version.");
            }

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
            const content = await this.vsWorkspace.readFile(filePath);
            const doc = new BpmnDocument(content);
            try {
                const platform = doc.detectPlatform();
                const entry: BpmnFileEntry = { path: filePath, document: doc, platform };
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
     * Files open in an editor are updated via {@link VsCodeDocument.write};
     * files only on disk are written via {@link VsCodeWorkspace.writeFile}.
     */
    private async applyVersionUpdate(
        files: readonly BpmnFileEntry[],
        targetVersion: string,
        platform: Engine,
    ): Promise<number> {
        let updatedCount = 0;

        for (const file of files) {
            const currentVersion = file.document.detectPlatformVersion();
            if (currentVersion === targetVersion) {
                continue;
            }

            let updatedDoc: BpmnDocument;
            if (currentVersion === undefined) {
                const platformName = platform === "c7" ? "Camunda Platform" : "Camunda Cloud";
                const schema =
                    platform === "c7"
                        ? `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"`
                        : `xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"`;
                updatedDoc = file.document.withExecutionPlatform(
                    platformName,
                    targetVersion,
                    schema,
                );
                this.notifier.logWarning(
                    `Added missing executionPlatform attribute to: ${file.path}`,
                );
            } else {
                updatedDoc = file.document.withVersion(targetVersion);
            }

            const editorId = this.editorStore.findEditorIdByPath(file.path);
            if (editorId !== undefined) {
                await this.vsDocument.write(editorId, updatedDoc.xml);
            } else {
                await this.vsWorkspace.writeFile(file.path, updatedDoc.xml);
            }

            updatedCount++;
        }

        return updatedCount;
    }

    private handleError(error: Error): boolean {
        this.notifier.notifyError("A problem occurred while migrating BPMN diagrams.", error);
        return false;
    }
}
