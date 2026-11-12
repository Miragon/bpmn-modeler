import { commands, env, ExtensionContext, Uri, workspace } from "vscode";

import { Command, GetDiagramAsSVGCommand, isMessageOfType } from "@miragon/bpmn-modeler-shared";

import { EditorSubscription } from "@miragon/bpmn-modeler-core";
import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { EditorSessionDocuments } from "@miragon/bpmn-modeler-core";
import {
    BPMN_VIEW_TYPE,
    BpmnDocument,
    createEmptyForm,
    DMN_VIEW_TYPE,
    FOCUS_BPMN_DIAGRAM_MESSAGE,
    FORM_VIEW_TYPE,
    EngineVersionSelectionService,
    ModelerLanguageService,
    newModelEnginePrompt,
    NewModelFilePrompt,
    newBpmnModelFilePrompt,
    newDmnModelFilePrompt,
    newFormModelFilePrompt,
} from "@miragon/bpmn-modeler-core";
import { EMPTY_DMN_DIAGRAM } from "@miragon/bpmn-modeler-types";
import { ModelerPreferences } from "../../../../shared/port/ModelerPreferences";
import { promptNewFileTarget } from "../../../../shared/adapter/in/newFileTarget";
import { VsCodeTextEditor } from "../../../../shared/adapter/in/VsCodeTextEditor";
import { BpmnLayoutService } from "@miragon/bpmn-modeler-core";
import { NotifierPort, PendingEditsFlush, PickerPort } from "@miragon/bpmn-modeler-core";
import { BpmnMigrationService } from "@miragon/bpmn-modeler-core";

export const TOGGLE_CMD = "bpmn-modeler.toggleTextEditor";
export const LOGGING_CMD = "bpmn-modeler.openLoggingConsole";
export const COPY_SVG_CMD = "bpmn-modeler.copyDiagramAsSvg";
export const SAVE_SVG_CMD = "bpmn-modeler.saveDiagramAsSvgCommand";
export const CHANGE_ENGINE_VERSION_CMD = "bpmn-modeler.changeEngineVersion";
export const MIGRATE_ALL_CMD = "bpmn-modeler.migrateAllDiagrams";
export const CHANGE_LANGUAGE_CMD = "bpmn-modeler.changeLanguage";
export const TOGGLE_LINTING_CMD = "bpmn-modeler.toggleLinting";
export const TOGGLE_AUTOMATIC_FORM_PREVIEW_CMD = "bpmn-modeler.toggleAutomaticFormPreview";
export const NEW_BPMN_MODEL_CMD = "bpmn-modeler.newBpmnModel";
export const NEW_DMN_MODEL_CMD = "bpmn-modeler.newDmnModel";
export const NEW_FORM_MODEL_CMD = "bpmn-modeler.newFormModel";
// Manual fallback
// for setups where the element-template file watcher never fires (WSL +
// symlinked workspace): a reload re-requests the templates from the host.
export const RELOAD_MODELER_CMD = "bpmn-modeler.reloadModeler";
export const FORMAT_DIAGRAM_CMD = "bpmn-modeler.formatDiagram";
export const CLEANUP_DIAGRAM_CMD = "bpmn-modeler.cleanupDiagram";

export type DocumentFlusher = Pick<PendingEditsFlush, "flushIntoDocument" | "release">;

/**
 * Registers and handles all VS Code command contributions for the modeler.
 */
export class CommandController {
    private svgSubscription: EditorSubscription | undefined;
    private automaticPreviewUpdate = Promise.resolve();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: EditorSessionDocuments,
        private readonly notifier: NotifierPort,
        private readonly textEditor: VsCodeTextEditor,
        private readonly engineSelection: Pick<
            EngineVersionSelectionService,
            "changeEngineVersion"
        >,
        private readonly migrationSvc: BpmnMigrationService,
        private readonly picker: PickerPort,
        private readonly documentFlush: DocumentFlusher,
        private readonly layoutSvc: BpmnLayoutService,
        private readonly preferences: ModelerPreferences,
        private readonly languageService: ModelerLanguageService,
    ) {}

    /** Registers all commands and pushes their disposables into the extension context. */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(TOGGLE_CMD, this.toggle, this),
            commands.registerCommand(LOGGING_CMD, this.showLogging, this),
            commands.registerCommand(COPY_SVG_CMD, this.writeToClipboard, this),
            commands.registerCommand(SAVE_SVG_CMD, this.writeToFile, this),
            commands.registerCommand(CHANGE_ENGINE_VERSION_CMD, this.changeEngineVersion, this),
            commands.registerCommand(MIGRATE_ALL_CMD, this.migrateAllDiagrams, this),
            commands.registerCommand(CHANGE_LANGUAGE_CMD, this.changeLanguage, this),
            commands.registerCommand(TOGGLE_LINTING_CMD, this.toggleLinting, this),
            commands.registerCommand(
                TOGGLE_AUTOMATIC_FORM_PREVIEW_CMD,
                this.toggleAutomaticFormPreview,
                this,
            ),
            commands.registerCommand(NEW_BPMN_MODEL_CMD, this.newBpmnModel, this),
            commands.registerCommand(NEW_DMN_MODEL_CMD, this.newDmnModel, this),
            commands.registerCommand(NEW_FORM_MODEL_CMD, this.newFormModel, this),
            commands.registerCommand(RELOAD_MODELER_CMD, this.reloadModeler, this),
            commands.registerCommand(FORMAT_DIAGRAM_CMD, this.formatDiagram, this),
            commands.registerCommand(CLEANUP_DIAGRAM_CMD, this.cleanupDiagram, this),
        );
    }

    /**
     * Rearranges the active diagram. The outcome comes back asynchronously as a
     * `DiagramFormattedCommand` and is surfaced by {@link BpmnLayoutService},
     * so there is nothing to report here.
     */
    async formatDiagram(): Promise<void> {
        try {
            await this.layoutSvc.format(this.editorStore.getActiveEditorId());
        } catch (error) {
            this.notifier.logError(error as Error);
            this.notifier.showInfo(FOCUS_BPMN_DIAGRAM_MESSAGE);
        }
    }

    /** Reports what a cleanup would remove; removal happens only after confirmation. */
    async cleanupDiagram(): Promise<void> {
        try {
            await this.layoutSvc.inspectCleanup(this.editorStore.getActiveEditorId());
        } catch (error) {
            this.notifier.logError(error as Error);
            this.notifier.showInfo(FOCUS_BPMN_DIAGRAM_MESSAGE);
        }
    }

    /** Toggles the standard VS Code text editor for the active document. */
    toggle(): Promise<boolean> {
        const activeId = this.editorStore.getActiveEditorId();
        const documentPath = this.vsDocument.getFilePath(activeId);
        return this.textEditor.toggle(documentPath);
    }

    /**
     * Restarts the active modeler webview so it re-requests the diagram,
     * element templates, and settings — the manual workaround for setups where
     * the element-template file watcher never delivers events (WSL + symlinked
     * workspace). Unsaved edits survive: the `TextDocument` is the source of
     * truth and the restarted webview re-imports its (dirty) text.
     */
    async reloadModeler(): Promise<void> {
        const editorId = this.editorStore.getActiveEditorId();
        const result = await this.documentFlush.flushIntoDocument(editorId, { destructive: true });
        if (result.status !== "safe") return;
        if (!this.editorStore.isCurrentEditorSession(editorId, result.session)) {
            this.documentFlush.release(editorId, result.session);
            return;
        }
        try {
            this.editorStore.reload(editorId);
        } finally {
            this.documentFlush.release(editorId, result.session);
        }
    }

    /** Reveals the extension's output channel. */
    showLogging(): void {
        this.notifier.openLoggingConsole();
    }

    /** Prompts for the active document's supported engine metadata. */
    changeEngineVersion(): Promise<boolean> {
        return this.logAndRethrow(() =>
            this.engineSelection.changeEngineVersion(this.editorStore.getActiveEditorId()),
        );
    }

    /** Migrates all workspace BPMN diagrams to a user-selected version. */
    migrateAllDiagrams(): Promise<boolean> {
        return this.logAndRethrow(() => this.migrationSvc.migrateAllDiagrams());
    }

    /** Changes the application UI language, including with no editor open. */
    changeLanguage(): Promise<void> {
        return this.logAndRethrow(() => this.languageService.changeLanguage());
    }

    /**
     * Flips `miragon.bpmnModeler.linting.enabled`, the design-only opt-out.
     * Reachable from the command palette and the "BPMNlint: off" status-bar
     * badge; the webview pill writes the same setting directly. The config
     * change re-lints every open editor, so no webview message is sent from here.
     */
    toggleLinting(): Promise<void> {
        return this.logAndRethrow(async () => {
            const enabled = !this.preferences.lintingEnabled();
            await this.preferences.setLintingEnabled(enabled);
            this.notifier.logInfo(`BPMN linting ${enabled ? "enabled" : "disabled"}`);
        });
    }

    toggleAutomaticFormPreview(): Promise<void> {
        const update = this.automaticPreviewUpdate.then(() =>
            this.logAndRethrow(async () => {
                await this.preferences.setFormPreviewAutomatic(
                    !this.preferences.formPreviewAutomatic(),
                );
            }),
        );
        this.automaticPreviewUpdate = update.catch(() => undefined);
        return update;
    }

    /**
     * Scaffolds a new BPMN model and opens it in the custom editor.
     *
     * The engine is chosen *before* the file is written so a cancelled quick-pick
     * leaves nothing behind — the alternative (write empty, seed on open) orphans
     * a blank `.bpmn` on cancel.
     */
    newBpmnModel(): Promise<void> {
        return this.logAndRethrow(async () => {
            const target = await this.promptNewModelTarget(newBpmnModelFilePrompt());
            if (!target) {
                return; // dialog dismissed — silent no-op
            }

            const engine = await this.picker.choose(newModelEnginePrompt());
            if (engine === undefined) {
                return; // no file created
            }

            const doc = BpmnDocument.forNewModel(engine);
            await workspace.fs.writeFile(target, Buffer.from(doc.xml));
            await commands.executeCommand("vscode.openWith", target, BPMN_VIEW_TYPE);
        });
    }

    /** Scaffolds a new DMN model and opens it. DMN has no engine choice, so no quick-pick. */
    newDmnModel(): Promise<void> {
        return this.logAndRethrow(async () => {
            const target = await this.promptNewModelTarget(newDmnModelFilePrompt());
            if (!target) {
                return;
            }
            await workspace.fs.writeFile(target, Buffer.from(EMPTY_DMN_DIAGRAM));
            await commands.executeCommand("vscode.openWith", target, DMN_VIEW_TYPE);
        });
    }

    /** Creates a valid Camunda Form and opens it in the visual editor. */
    newFormModel(): Promise<void> {
        return this.logAndRethrow(async () => {
            const target = await this.promptNewModelTarget(newFormModelFilePrompt());
            if (!target) {
                return;
            }
            await workspace.fs.writeFile(target, Buffer.from(createEmptyForm()));
            await commands.executeCommand("vscode.openWith", target, FORM_VIEW_TYPE);
        });
    }

    /** Works without a workspace folder open: the `defaultUri` is simply omitted. */
    private promptNewModelTarget(prompt: NewModelFilePrompt): Promise<Uri | undefined> {
        const folder = workspace.workspaceFolders?.[0];
        return promptNewFileTarget({
            title: prompt.title,
            filterLabel: prompt.filterLabel,
            extension: prompt.extension,
            defaultUri: folder ? Uri.joinPath(folder.uri, prompt.defaultFileName) : undefined,
        });
    }

    /**
     * Runs an async command body, logging any rejection to the output channel
     * before rethrowing. Without the log a rejected config update (e.g. the
     * language write) never reaches the channel; the rethrow preserves VS Code's
     * own command-failed surfacing so the user still sees the error.
     */
    private async logAndRethrow<T>(run: () => Promise<T>): Promise<T> {
        try {
            return await run();
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    /** Requests the current diagram's SVG from the active webview and copies it to the clipboard. */
    writeToClipboard(): void {
        this.requestSvg((svg) => {
            env.clipboard.writeText(svg);
        });
    }

    /** Requests the current diagram's SVG and writes it to a `.svg` next to the `.bpmn` source. */
    writeToFile(): void {
        this.requestSvg(async (svg, sourceEditorId) => {
            const filePath = this.vsDocument.getFilePath(sourceEditorId).replace(/\.bpmn$/, ".svg");
            await workspace.fs.writeFile(Uri.file(filePath), Buffer.from(svg));
            this.notifier.logInfo(`Diagram SVG exported to ${filePath}`);
        });
    }

    /**
     * Sends a `GetDiagramAsSVGCommand` to the active webview and subscribes to the
     * response, disposing any previously active SVG subscription first. `onSvg`'s
     * result is awaited so a rejected async sink (a failed `workspace.fs` write, a
     * denied clipboard write) reaches the channel instead of floating away as an
     * unhandled rejection.
     *
     * `onSvg` receives the editor the request went to, because the command target
     * may have moved to another diagram by the time the reply arrives.
     */
    private requestSvg(onSvg: (svg: string, sourceEditorId: string) => void | Promise<void>): void {
        const sourceEditorId = this.editorStore.getActiveEditorId();

        this.editorStore
            .postMessage(sourceEditorId, new GetDiagramAsSVGCommand())
            .catch((error) => {
                this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            });

        // Dispose previous subscription to avoid accumulating listeners.
        this.svgSubscription?.dispose();

        this.svgSubscription = this.editorStore.subscribeToActiveEditorMessage(
            (message: Command) => {
                if (isMessageOfType(message, "GetDiagramAsSVGCommand")) {
                    const cmd = message;
                    if (cmd.svg && cmd.svg.length > 0) {
                        Promise.resolve(onSvg(cmd.svg, sourceEditorId)).catch((error) => {
                            this.notifier.logError(
                                error instanceof Error ? error : new Error(String(error)),
                            );
                        });
                    }
                    // Dispose after receiving the response.
                    this.svgSubscription?.dispose();
                    this.svgSubscription = undefined;
                }
            },
        );
    }
}
