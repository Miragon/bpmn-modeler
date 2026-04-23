import { posix } from "path";

import {
    BpmnFileQuery,
    BpmnModelerSettingQuery,
    ClipboardQuery,
    ElementTemplatesQuery,
    LanguageQuery,
    TextClipboardQuery,
} from "@bpmn-modeler/shared";

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
 * Application service for the BPMN modeler.
 *
 * Owns the per-editor session map for echo-prevention and exposes the five
 * BPMN use-case methods that were previously spread across five separate
 * use-case classes.  Implements {@link ArtifactChangeTarget} so that
 * {@link ArtifactService.createWatcher} can call back into this service
 * without creating a circular module import.
 */
export class BpmnModelerService implements ArtifactChangeTarget {
    /** Per-editor echo-prevention guard state, keyed by document URI path. */
    private readonly sessions: Map<string, ModelerSession> = new Map();

    /**
     * @param editorStore Central registry for open editor panels and messaging.
     * @param vsDocument Active-document read/write helper.
     * @param vsSettings VS Code configuration reader.
     * @param vsUI User-facing message, logging, and quick-pick helper.
     * @param artifactSvc Service for locating forms and element templates.
     * @param statusBar Status bar item manager for element templates and engine version.
     * @param vsWorkspace Workspace filesystem helper for reading/writing files on disk.
     * @param panelStateRepo Persistence for the global properties-panel visibility default.
     */
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

    // ─── Session management ───────────────────────────────────────────────────

    /**
     * Creates and registers a new {@link ModelerSession} for the given editor.
     *
     * @param editorId Document URI path used as the session identifier.
     */
    registerSession(editorId: string): void {
        this.sessions.set(editorId, new ModelerSession(editorId));
    }

    /**
     * Removes the session for the given editor, freeing guard state.
     *
     * @param editorId Document URI path of the editor being closed.
     */
    disposeSession(editorId: string): void {
        this.sessions.delete(editorId);
    }

    // ─── Display ──────────────────────────────────────────────────────────────

    /**
     * Sends the BPMN file to the webview for rendering.
     *
     * Returns `false` immediately if the session guard is active, meaning the
     * document change was caused by the extension's own write (echo prevention).
     *
     * If the file is empty the user is asked to select an execution platform and
     * an empty template is written to disk.  If the execution platform cannot be
     * auto-detected the user is asked to select it and the file is updated.
     *
     * @param editorId Document URI path of the target editor.
     * @returns `true` on success, `false` on any failure.
     */
    async display(editorId: string): Promise<boolean> {
        const session = this.sessions.get(editorId);
        if (session?.isGuarded()) {
            return false;
        }

        try {
            let bpmnFile = this.vsDocument.getContent(editorId);

            if (bpmnFile === "") {
                const ep = await this.vsUI.pickExecutionPlatform(
                    "Select the engine.",
                    ["Camunda 7", "Camunda 8"],
                );

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

                // Update the status bar with the detected version.
                const version = detectExecutionPlatformVersion(bpmnFile);
                if (version) {
                    this.statusBar.showEngineVersion(ep, version);
                }

                return sent;
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message === "The active editor is hidden."
                ) {
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

    // ─── Document sync ────────────────────────────────────────────────────────

    /**
     * Writes the XML content received from the webview back to the VS Code
     * text document.
     *
     * Acquires the per-session echo-prevention guard before writing and
     * releases it in the `finally` block so it is always released even if the
     * write fails.
     *
     * @param editorId Document URI path of the target editor.
     * @param content XML content received from the webview.
     * @returns `true` if the document was changed, `false` if content was identical.
     */
    async sync(editorId: string, content: string): Promise<boolean> {
        const session = this.sessions.get(editorId);
        session?.acquireGuard();
        try {
            return await this.vsDocument.write(editorId, content);
        } catch (error) {
            return this.handleSyncError(error as Error);
        } finally {
            session?.releaseGuard();
        }
    }

    // ─── Artifact injection ───────────────────────────────────────────────────

    /**
     * Reads all element-template files in the workspace and sends them to the
     * webview.
     *
     * @param editorId Document URI path of the target editor.
     * @returns `true` on success, `false` on any failure.
     */
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

            if (
                await this.editorStore.postMessage(
                    editorId,
                    new ElementTemplatesQuery(sorted),
                )
            ) {
                this.statusBar.showElementTemplatesReady(sorted.length);
                if (artifacts.length > 0) {
                    this.vsUI.logInfo(`${artifacts.length} element templates are set.`);
                }
                return true;
            } else {
                this.statusBar.hideElementTemplatesStatus();
                return this.handleError(
                    new Error("Setting the `elementTemplates` failed."),
                );
            }
        } catch (error) {
            this.statusBar.hideElementTemplatesStatus();
            return this.handleError(error as Error);
        }
    }

    // ─── Settings ─────────────────────────────────────────────────────────────

    /**
     * Reads the current BPMN modeler settings and sends them to the webview.
     *
     * @param editorId Document URI path of the target editor.
     * @returns `true` on success, `false` on any failure.
     */
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

    // ─── Properties-panel visibility ───────────────────────────────────────

    /**
     * Reads the globally persisted properties-panel visibility default
     * synchronously.  Used by the editor controller at resolve time so the
     * webview HTML can be pre-rendered with the correct collapsed state and
     * the panel never flashes visible before CSS applies.
     */
    getPersistedPanelVisibility(): boolean {
        return this.panelStateRepo.getVisibility();
    }

    /**
     * Persists the user's panel-visibility toggle as the new global default.
     * Intentionally does not re-broadcast to other open webviews: each
     * running webview is authoritative over its own panel, so hiding the
     * panel in one side-by-side editor must not close it in its neighbour.
     *
     * @param visible The new global default — `true` for visible, `false` for collapsed.
     */
    async setPropertiesPanelVisibility(visible: boolean): Promise<void> {
        try {
            await this.panelStateRepo.setVisibility(visible);
        } catch (error) {
            this.vsUI.logError(error as Error);
        }
    }

    // ─── Clipboard ─────────────────────────────────────────────────────────

    /**
     * Reads the system clipboard and sends its text content to the webview.
     *
     * Used for cross-editor paste: the webview cannot read the clipboard
     * directly because VS Code sandboxed iframes lack `clipboard-read`
     * permission, so the extension host mediates the read.
     *
     * @param editorId Document URI path of the requesting editor.
     * @returns `true` on success, `false` on any failure.
     */
    async readClipboard(editorId: string): Promise<boolean> {
        try {
            const text = await this.vsUI.readClipboard();
            return await this.editorStore.postMessage(
                editorId,
                new ClipboardQuery(text),
            );
        } catch (error) {
            this.vsUI.logError(error as Error);
            return false;
        }
    }

    /**
     * Reads the system clipboard and sends its text content to the webview
     * as a {@link TextClipboardQuery}, used for label text paste operations.
     *
     * @param editorId Document URI path of the requesting editor.
     * @returns `true` on success, `false` on any failure.
     */
    async readTextClipboard(editorId: string): Promise<boolean> {
        try {
            const text = await this.vsUI.readClipboard();
            return await this.editorStore.postMessage(
                editorId,
                new TextClipboardQuery(text),
            );
        } catch (error) {
            this.vsUI.logError(error as Error);
            return false;
        }
    }

    /**
     * Writes the given text to the system clipboard via the extension host.
     *
     * Used for cross-editor copy: the webview cannot write to the clipboard
     * directly because VS Code sandboxed iframes lack `clipboard-write`
     * permission, so the extension host mediates the write.
     *
     * @param text The serialised BPMN clip text to write.
     */
    async writeClipboard(text: string): Promise<void> {
        try {
            await this.vsUI.writeClipboard(text);
        } catch (error) {
            this.vsUI.logError(error as Error);
        }
    }

    // ─── Language ──────────────────────────────────────────────────────────

    /**
     * Reads the configured language from workspace settings and sends it to
     * the webview for the given editor.
     *
     * @param editorId Document URI path of the target editor.
     */
    setLanguage(editorId: string): void {
        const locale = this.vsSettings.getLanguage();
        this.editorStore
            .postMessage(editorId, new LanguageQuery(locale))
            .catch((error) => {
                this.vsUI.logError(
                    error instanceof Error ? error : new Error(String(error)),
                );
            });
    }

    // ─── Change engine version ─────────────────────────────────────────────

    /**
     * Prompts the user to select a new engine version for the given editor and
     * updates the BPMN XML, the webview, and the status bar accordingly.
     *
     * @param editorId Document URI path of the target editor.
     * @returns `true` on success, `false` on any failure or cancellation.
     */
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

    // ─── Migrate all diagrams ──────────────────────────────────────────────

    /**
     * Scans all `.bpmn` files in the workspace and updates their
     * `modeler:executionPlatformVersion` to a user-selected target version.
     *
     * Same-engine only — no cross-platform migration (C7↔C8).
     *
     * @returns `true` on success, `false` on cancellation or failure.
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

            // Collect all user input before applying any writes.
            // This prevents document-change listeners (triggered by write) from
            // stealing focus and dismissing a subsequent QuickPick.
            let c7Version: string | undefined;
            let c8Version: string | undefined;

            if (scope === "c7" || scope === "both") {
                c7Version = await this.vsUI.pickEngineVersion("c7", getVersions("c7"));
            }
            if (scope === "c8" || scope === "both") {
                c8Version = await this.vsUI.pickEngineVersion("c8", getVersions("c8"));
            }

            // Apply all writes after user input is complete
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

    /**
     * Reads and classifies all BPMN files into a {@link MigrationPlan}.
     *
     * @param paths Absolute file paths of discovered `.bpmn` files.
     */
    private async buildMigrationPlan(paths: string[]): Promise<MigrationPlan> {
        const c7Files: BpmnFileEntry[] = [];
        const c8Files: BpmnFileEntry[] = [];
        const undetected: string[] = [];

        for (const filePath of paths) {
            const content = await this.vsWorkspace.readFile(filePath);
            try {
                const platform = detectExecutionPlatform(content);
                const version = detectExecutionPlatformVersion(content);
                const entry: BpmnFileEntry = { path: filePath, content, platform, version };
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
     * Writes the updated version to each file, skipping files already at
     * the target version. Files open in an editor are updated via
     * {@link VsCodeDocument.write}; files only on disk are written via
     * {@link VsCodeWorkspace.writeFile}.
     *
     * @param files The files to update.
     * @param targetVersion The new version string.
     * @param platform The execution platform for files that need `addExecutionPlatform`.
     * @returns The number of files actually updated.
     */
    private async applyVersionUpdate(
        files: readonly BpmnFileEntry[],
        targetVersion: string,
        platform: "c7" | "c8",
    ): Promise<number> {
        let updatedCount = 0;

        for (const file of files) {
            if (file.version === targetVersion) {
                continue;
            }

            let updatedContent: string;
            if (file.version === undefined) {
                // File has namespace but no version attribute — inject it.
                const platformName = platform === "c7" ? "Camunda Platform" : "Camunda Cloud";
                const schema =
                    platform === "c7"
                        ? `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"`
                        : `xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"`;
                updatedContent = addExecutionPlatform(file.content, platformName, targetVersion, schema);
                this.vsUI.logWarning(
                    `Added missing executionPlatform attribute to: ${file.path}`,
                );
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

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Logs and displays an error from `display` or `setElementTemplates`,
     * then returns `false`.
     *
     * @param error The error that occurred.
     */
    private handleError(error: Error): boolean {
        this.vsUI.logError(error);
        this.vsUI.showError(
            `A problem occurred while trying to display the BPMN Modeler.\n${error.message ?? error}`,
        );
        return false;
    }

    /**
     * Logs and displays an error from `sync`, then returns `false`.
     *
     * @param error The error that occurred during the document write.
     */
    private handleSyncError(error: Error): boolean {
        this.vsUI.logError(error);
        this.vsUI.showError(
            `A problem occurred while trying to sync the BPMN file.\n${error.message}`,
        );
        return false;
    }
}
