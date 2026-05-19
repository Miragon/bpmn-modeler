import { posix } from "path";

import {
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    ElementTemplatesQuery,
    Engine,
    LanguageQuery,
    PropertiesPanelStateQuery,
    TextClipboardQuery,
} from "@miragon/bpmn-modeler-shared";

import { ModelerSession } from "../domain/session";
import { SettingBuilder } from "../domain/model";
import { ExecutionPlatformNotDetectedError, UserCancelledError } from "../domain/errors";
import { getLatestVersion, getVersions } from "../domain/engineVersions";
import { BpmnFileEntry, MigrationPlan, MigrationScope } from "../domain/MigrationPlan";
import { EditorStore } from "../infrastructure/EditorStore";
import { PropertiesPanelStateRepository } from "../infrastructure/PropertiesPanelStateRepository";
import { VsCodeDocument } from "../infrastructure/VsCodeDocument";
import { VsCodeWorkspace } from "../infrastructure/VsCodeWorkspace";
import { VsCodeSettings } from "../infrastructure/VsCodeSettings";
import { VsCodeStatusBar } from "../infrastructure/VsCodeStatusBar";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { ArtifactChangeTarget, ArtifactService } from "./ArtifactService";
import {
    addExecutionPlatform,
    detectExecutionPlatform,
    detectExecutionPlatformVersion,
    emptyC7BpmnDiagram,
    emptyC8BpmnDiagram,
    updateExecutionPlatformVersion,
} from "./bpmnUtils";

/**
 * Owns the per-editor {@link ModelerSession} map that drives echo
 * prevention: writes initiated by the webview acquire a guard before the
 * extension writes back, so the resulting `onDidChangeTextDocument` event
 * is skipped by {@link display} instead of being re-rendered.
 */
export class BpmnModelerService implements ArtifactChangeTarget {
    private readonly sessions: Map<string, ModelerSession> = new Map();

    constructor(
        private readonly editorStore: EditorStore,
        private readonly vsDocument: VsCodeDocument,
        private readonly vsSettings: VsCodeSettings,
        private readonly vsUI: VsCodeUI,
        private readonly artifactSvc: ArtifactService,
        private readonly statusBar: VsCodeStatusBar,
        private readonly vsWorkspace: VsCodeWorkspace,
        private readonly panelStateRepo: PropertiesPanelStateRepository,
    ) {}

    registerSession(editorId: string): void {
        this.sessions.set(editorId, new ModelerSession(editorId));
    }

    disposeSession(editorId: string): void {
        this.sessions.delete(editorId);
    }

    async display(editorId: string): Promise<boolean> {
        // Skip echoed document changes caused by our own write.
        const session = this.sessions.get(editorId);
        if (session?.isGuarded()) {
            return false;
        }

        try {
            let bpmnFile = this.vsDocument.getContent(editorId);

            if (bpmnFile === "") {
                const ep = await this.vsUI.pickExecutionPlatform("Select the engine.", [
                    "Camunda 7",
                    "Camunda 8",
                ]);

                const latestVersion = getLatestVersion(ep);
                bpmnFile =
                    ep === "c7"
                        ? emptyC7BpmnDiagram(latestVersion)
                        : emptyC8BpmnDiagram(latestVersion);

                await this.vsDocument.write(editorId, bpmnFile);
                await this.vsDocument.save(editorId);
            }

            try {
                const ep = detectExecutionPlatform(bpmnFile);
                const sent = await this.editorStore.postMessage(
                    editorId,
                    new BpmnFileQuery(bpmnFile, ep),
                );

                const version = detectExecutionPlatformVersion(bpmnFile);
                if (version) {
                    this.statusBar.showEngineVersion(ep, version);
                }

                return sent;
            } catch (error) {
                if (error instanceof Error && error.message === "The active editor is hidden.") {
                    return false;
                } else if (error instanceof ExecutionPlatformNotDetectedError) {
                    const ep = await this.vsUI.pickExecutionPlatform(
                        "Select the execution platform.",
                        ["Camunda 7", "Camunda 8"],
                    );

                    const latestVersion = getLatestVersion(ep);
                    const newBpmnFile =
                        ep === "c7"
                            ? addExecutionPlatform(
                                  bpmnFile,
                                  "Camunda Platform",
                                  latestVersion,
                                  `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"`,
                              )
                            : addExecutionPlatform(
                                  bpmnFile,
                                  "Camunda Cloud",
                                  latestVersion,
                                  `xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"`,
                              );

                    await this.editorStore.postMessage(
                        editorId,
                        new BpmnFileQuery(newBpmnFile, ep),
                    );
                    this.statusBar.showEngineVersion(ep, latestVersion);
                    return this.vsDocument.write(editorId, newBpmnFile);
                } else {
                    return this.handleError(error as Error);
                }
            }
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    async sync(editorId: string, content: string): Promise<boolean> {
        const session = this.sessions.get(editorId);
        // Guard around the write so the resulting document-change event is
        // recognised as our own echo and not re-rendered.
        session?.acquireGuard();
        try {
            return await this.vsDocument.write(editorId, content);
        } catch (error) {
            return this.handleSyncError(error as Error);
        } finally {
            session?.releaseGuard();
        }
    }

    async setElementTemplates(editorId: string): Promise<boolean> {
        this.statusBar.showElementTemplatesLoading();
        try {
            const documentDir = posix.dirname(this.vsDocument.getFilePath(editorId));

            const [artifacts] = await this.artifactSvc.getArtifactPaths(documentDir);

            const parsed = await Promise.all(
                artifacts.map(async (a) => {
                    try {
                        return JSON.parse(await this.artifactSvc.readFile(a));
                    } catch (error) {
                        this.vsUI.logError(
                            new Error(
                                `Failed to parse element template "${a}": ${(error as Error).message}`,
                            ),
                        );
                        return [];
                    }
                }),
            );
            const sorted = parsed
                .flat()
                .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
                    String(a.name ?? "").localeCompare(String(b.name ?? "")),
                );

            if (await this.editorStore.postMessage(editorId, new ElementTemplatesQuery(sorted))) {
                this.statusBar.showElementTemplatesReady(sorted.length);
                if (artifacts.length > 0) {
                    this.vsUI.logInfo(`${artifacts.length} element templates are set.`);
                }
                return true;
            } else {
                this.statusBar.hideElementTemplatesStatus();
                return this.handleError(new Error("Setting the `elementTemplates` failed."));
            }
        } catch (error) {
            this.statusBar.hideElementTemplatesStatus();
            return this.handleError(error as Error);
        }
    }

    async setSettings(editorId: string): Promise<boolean> {
        try {
            const settings = new SettingBuilder()
                .alignToOrigin(this.vsSettings.getAlignToOrigin())
                .showTransactionBoundaries(this.vsSettings.getShowTransactionBoundaries())
                .colorTheme(this.vsSettings.getColorTheme())
                .favouriteBpmnElements(this.vsSettings.getFavouriteBpmnElements())
                .buildBpmnModeler();

            if (
                await this.editorStore.postMessage(
                    editorId,
                    new BpmnModelerSettingQuery({
                        alignToOrigin: settings.alignToOrigin,
                        showTransactionBoundaries: settings.showTransactionBoundaries,
                        colorTheme: settings.colorTheme,
                        favouriteBpmnElements: settings.favouriteBpmnElements,
                    }),
                )
            ) {
                return true;
            } else {
                return this.handleError(new Error("Unable to set preferences."));
            }
        } catch (error) {
            this.vsUI.logError(error as Error);
            return false;
        }
    }

    /**
     * Sync read so the webview HTML can be pre-rendered with the correct
     * collapsed state and the panel never flashes visible before
     * {@link sendPropertiesPanelState} delivers the value over the channel.
     */
    getPersistedPanelVisibility(): boolean {
        return this.panelStateRepo.getVisibility();
    }

    async sendPropertiesPanelState(editorId: string): Promise<boolean> {
        try {
            const visible = this.panelStateRepo.getVisibility();
            return await this.editorStore.postMessage(
                editorId,
                new PropertiesPanelStateQuery(visible),
            );
        } catch (error) {
            this.vsUI.logError(error as Error);
            return false;
        }
    }

    /**
     * Intentionally does not re-broadcast to other open webviews: each
     * webview is authoritative over its own panel, so hiding it in one
     * side-by-side editor must not close it in its neighbour.
     */
    async setPropertiesPanelVisibility(visible: boolean): Promise<void> {
        try {
            await this.panelStateRepo.setVisibility(visible);
        } catch (error) {
            this.vsUI.logError(error as Error);
        }
    }

    /**
     * The extension host mediates clipboard access: VS Code sandboxed iframes
     * lack `clipboard-read` / `clipboard-write` permissions.
     */
    async readClipboard(editorId: string): Promise<boolean> {
        try {
            const text = await this.vsUI.readClipboard();
            return await this.editorStore.postMessage(editorId, new ClipboardQuery(text));
        } catch (error) {
            this.vsUI.logError(error as Error);
            return false;
        }
    }

    async readTextClipboard(editorId: string): Promise<boolean> {
        try {
            const text = await this.vsUI.readClipboard();
            return await this.editorStore.postMessage(editorId, new TextClipboardQuery(text));
        } catch (error) {
            this.vsUI.logError(error as Error);
            return false;
        }
    }

    async writeClipboard(text: string): Promise<void> {
        try {
            await this.vsUI.writeClipboard(text);
        } catch (error) {
            this.vsUI.logError(error as Error);
        }
    }

    setLanguage(editorId: string): void {
        const locale = this.vsSettings.getLanguage();
        this.editorStore.postMessage(editorId, new LanguageQuery(locale)).catch((error) => {
            this.vsUI.logError(error instanceof Error ? error : new Error(String(error)));
        });
    }

    async changeEngineVersion(editorId: string): Promise<boolean> {
        try {
            const bpmnFile = this.vsDocument.getContent(editorId);
            const platform = detectExecutionPlatform(bpmnFile);
            const versions = getVersions(platform);

            const newVersion = await this.vsUI.pickEngineVersion(platform, versions);

            const updatedBpmn = updateExecutionPlatformVersion(bpmnFile, newVersion);
            await this.vsDocument.write(editorId, updatedBpmn);

            this.statusBar.showEngineVersion(platform, newVersion);
            return await this.display(editorId);
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    /**
     * Same-engine only — no cross-platform migration (C7↔C8).
     */
    async migrateAllDiagrams(): Promise<boolean> {
        try {
            const paths = await this.vsWorkspace.findFiles("**/*.bpmn");
            if (paths.length === 0) {
                this.vsUI.showInfo("No BPMN files found in the workspace.");
                return false;
            }

            const plan = await this.buildMigrationPlan(paths);
            if (plan.isEmpty()) {
                this.vsUI.showInfo(
                    "Could not detect the engine for any BPMN file in the workspace.",
                );
                return false;
            }

            if (plan.undetected.length > 0) {
                this.vsUI.logWarning(
                    `Skipped ${plan.undetected.length} file(s) with undetectable engine: ${plan.undetected.join(", ")}`,
                );
            }

            let scope: MigrationScope;
            if (plan.hasBothPlatforms()) {
                scope = await this.vsUI.pickMigrationScope(
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
                c7Version = await this.vsUI.pickEngineVersion("c7", getVersions("c7"));
            }
            if (scope === "c8" || scope === "both") {
                c8Version = await this.vsUI.pickEngineVersion("c8", getVersions("c8"));
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
                this.vsUI.showInfo(`Updated ${summaryParts.join(" and ")}.`);
            } else {
                this.vsUI.showInfo("All diagrams are already at the selected version.");
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
            try {
                const platform = detectExecutionPlatform(content);
                const version = detectExecutionPlatformVersion(content);
                const entry: BpmnFileEntry = {
                    path: filePath,
                    content,
                    platform,
                    version,
                };
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
            if (file.version === targetVersion) {
                continue;
            }

            let updatedContent: string;
            if (file.version === undefined) {
                const platformName = platform === "c7" ? "Camunda Platform" : "Camunda Cloud";
                const schema =
                    platform === "c7"
                        ? `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"`
                        : `xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"`;
                updatedContent = addExecutionPlatform(
                    file.content,
                    platformName,
                    targetVersion,
                    schema,
                );
                this.vsUI.logWarning(`Added missing executionPlatform attribute to: ${file.path}`);
            } else {
                updatedContent = updateExecutionPlatformVersion(file.content, targetVersion);
            }

            const editorId = this.editorStore.findEditorIdByPath(file.path);
            if (editorId !== undefined) {
                await this.vsDocument.write(editorId, updatedContent);
            } else {
                await this.vsWorkspace.writeFile(file.path, updatedContent);
            }

            updatedCount++;
        }

        return updatedCount;
    }

    private handleError(error: Error): boolean {
        this.vsUI.logError(error);
        this.vsUI.showError(
            `A problem occurred while trying to display the BPMN Modeler.\n${error.message ?? error}`,
        );
        return false;
    }

    private handleSyncError(error: Error): boolean {
        this.vsUI.logError(error);
        this.vsUI.showError(
            `A problem occurred while trying to sync the BPMN file.\n${error.message}`,
        );
        return false;
    }
}
