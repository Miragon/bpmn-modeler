import {
    commands,
    ConfigurationTarget,
    env,
    ExtensionContext,
    Uri,
    window,
    workspace,
} from "vscode";

import { Command, GetDiagramAsSVGCommand } from "@miragon/bpmn-modeler-shared";
import { supportedLanguages } from "@miragon/bpmn-modeler-i18n";

import { EditorSubscription } from "@miragon/bpmn-modeler-core";
import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import {
    BPMN_VIEW_TYPE,
    BpmnDocument,
    DMN_VIEW_TYPE,
    EMPTY_DMN_DIAGRAM,
    getLatestVersion,
    UserCancelledError,
} from "@miragon/bpmn-modeler-core";
import { VsCodeDocument } from "../../../shared/infrastructure/VsCodeDocument";
import { VsCodeNotifier } from "../../../shared/infrastructure/VsCodeNotifier";
import { VsCodeTextEditor } from "../../../shared/infrastructure/VsCodeTextEditor";
import { VsCodePicker } from "../../../shared/infrastructure/VsCodePicker";
import { BpmnModelerService } from "@miragon/bpmn-modeler-core";
import { BpmnMigrationService } from "../../../migration/index";

// VS Code command ID for toggling the text editor.
export const TOGGLE_CMD = "bpmn-modeler.toggleTextEditor";
// VS Code command ID for opening the logging console.
export const LOGGING_CMD = "bpmn-modeler.openLoggingConsole";
// VS Code command ID for copying the diagram as SVG to the clipboard.
export const COPY_SVG_CMD = "bpmn-modeler.copyDiagramAsSvg";
// VS Code command ID for saving the diagram as an SVG file.
export const SAVE_SVG_CMD = "bpmn-modeler.saveDiagramAsSvgCommand";
// VS Code command ID for changing the engine version.
export const CHANGE_ENGINE_VERSION_CMD = "bpmn-modeler.changeEngineVersion";
// VS Code command ID for migrating all BPMN diagrams in the workspace.
export const MIGRATE_ALL_CMD = "bpmn-modeler.migrateAllDiagrams";
// VS Code command ID for changing the modeler language.
export const CHANGE_LANGUAGE_CMD = "bpmn-modeler.changeLanguage";
// VS Code command ID for scaffolding a new BPMN model.
export const NEW_BPMN_MODEL_CMD = "bpmn-modeler.newBpmnModel";
// VS Code command ID for scaffolding a new DMN model.
export const NEW_DMN_MODEL_CMD = "bpmn-modeler.newDmnModel";

/**
 * Registers and handles all VS Code command contributions for the modeler.
 *
 * Merges the three former command classes (`VsCodeToggleTextEditorCommand`,
 * `VsCodeOpenLoggingConsoleCommand`, `VsCodeDiagramAsSvgCommand`) into a
 * single, flat controller with no DI framework.
 */
export class CommandController {
    // Tracks the active SVG response subscription so it can be disposed before creating a new one.
    private svgSubscription: EditorSubscription | undefined;

    /**
     * @param editorStore Central registry for open editor panels and messaging.
     * @param vsDocument Active-document path helper.
     * @param notifier User-facing message and logging helper.
     * @param textEditor Toggles the companion text editor pane for the active document.
     * @param bpmnService BPMN-specific business logic for engine version changes.
     * @param migrationSvc Workspace-wide BPMN migration orchestrator.
     * @param picker Engine quick-pick used when scaffolding a new BPMN model.
     */
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: VsCodeDocument,
        private readonly notifier: VsCodeNotifier,
        private readonly textEditor: VsCodeTextEditor,
        private readonly bpmnService: BpmnModelerService,
        private readonly migrationSvc: BpmnMigrationService,
        private readonly picker: VsCodePicker,
    ) {}

    /**
     * Registers all commands with VS Code and pushes the resulting disposables
     * into the extension context.
     *
     * @param context The VS Code extension context.
     */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(TOGGLE_CMD, this.toggle, this),
            commands.registerCommand(LOGGING_CMD, this.showLogging, this),
            commands.registerCommand(COPY_SVG_CMD, this.writeToClipboard, this),
            commands.registerCommand(SAVE_SVG_CMD, this.writeToFile, this),
            commands.registerCommand(CHANGE_ENGINE_VERSION_CMD, this.changeEngineVersion, this),
            commands.registerCommand(MIGRATE_ALL_CMD, this.migrateAllDiagrams, this),
            commands.registerCommand(CHANGE_LANGUAGE_CMD, this.changeLanguage, this),
            commands.registerCommand(NEW_BPMN_MODEL_CMD, this.newBpmnModel, this),
            commands.registerCommand(NEW_DMN_MODEL_CMD, this.newDmnModel, this),
        );
    }

    /**
     * Toggles the standard VS Code text editor for the currently open document.
     *
     * @returns `true` if the text editor was opened, `false` if it was closed.
     */
    toggle(): Promise<boolean> {
        const activeId = this.editorStore.getActiveEditorId();
        const documentPath = this.vsDocument.getFilePath(activeId);
        return this.textEditor.toggle(documentPath);
    }

    /**
     * Reveals the extension's output channel in the VS Code UI.
     */
    showLogging(): void {
        this.notifier.openLoggingConsole();
    }

    /**
     * Prompts the user to select a new engine version for the active BPMN editor.
     *
     * Delegates to {@link BpmnModelerService.changeEngineVersion}.
     */
    changeEngineVersion(): Promise<boolean> {
        return this.logAndRethrow(() =>
            this.bpmnService.changeEngineVersion(this.editorStore.getActiveEditorId()),
        );
    }

    /**
     * Migrates all BPMN diagrams in the workspace to a user-selected version.
     *
     * Delegates to {@link BpmnMigrationService.migrateAllDiagrams}.
     */
    migrateAllDiagrams(): Promise<boolean> {
        return this.logAndRethrow(() => this.migrationSvc.migrateAllDiagrams());
    }

    /**
     * Prompts the user to select a UI language for the active modeler webview.
     *
     * Shows a QuickPick with all supported languages and sends the selected
     * locale to the active webview via {@link BpmnModelerService.setLanguage}.
     */
    changeLanguage(): Promise<void> {
        return this.logAndRethrow(async () => {
            const items = supportedLanguages.map((lang) => ({
                label: lang.label,
                description: lang.locale,
            }));

            const picked = await window.showQuickPick(items, {
                placeHolder: "Select the modeler language",
            });

            if (!picked) {
                return;
            }

            // Language is a personal UI preference rather than a project-scoped
            // setting — writing at Global (User) level avoids pinning one
            // collaborator's choice to a shared workspace settings file.
            await workspace
                .getConfiguration("miragon.bpmnModeler")
                .update("language", picked.description, ConfigurationTarget.Global);
            // Breadcrumb: a language switch changes UI strings across the modeler,
            // so record it to explain later "why is the panel in German?" reports.
            this.notifier.logInfo(`Modeler language changed to ${picked.description}`);
        });
    }

    /**
     * Prompts for a save location, picks the engine, then scaffolds a new BPMN
     * model there and opens it in the custom editor.
     *
     * The engine is chosen *before* the file is written so a cancelled quick-pick
     * leaves nothing behind — the alternative (write empty, seed on open) orphans
     * a blank `.bpmn` on cancel.
     */
    newBpmnModel(): Promise<void> {
        return this.logAndRethrow(async () => {
            const target = await this.promptNewModelTarget("New BPMN Model", "BPMN", "bpmn");
            if (!target) {
                return; // dialog dismissed — silent no-op
            }

            let doc: BpmnDocument;
            try {
                const engine = await this.picker.pickExecutionPlatform("Select the engine.", [
                    "Camunda 7",
                    "Camunda 8",
                ]);
                doc = BpmnDocument.empty(engine, getLatestVersion(engine));
            } catch (error) {
                if (error instanceof UserCancelledError) {
                    return; // no file created
                }
                throw error;
            }

            await workspace.fs.writeFile(target, Buffer.from(doc.xml));
            await commands.executeCommand("vscode.openWith", target, BPMN_VIEW_TYPE);
        });
    }

    /**
     * Prompts for a save location, then scaffolds a new DMN model there and opens
     * it in the custom editor. DMN has no engine choice, so no quick-pick.
     */
    newDmnModel(): Promise<void> {
        return this.logAndRethrow(async () => {
            const target = await this.promptNewModelTarget("New DMN Model", "DMN", "dmn");
            if (!target) {
                return;
            }
            await workspace.fs.writeFile(target, Buffer.from(EMPTY_DMN_DIAGRAM));
            await commands.executeCommand("vscode.openWith", target, DMN_VIEW_TYPE);
        });
    }

    /**
     * Single native prompt for name + location. Works without a workspace folder
     * open (the `defaultUri` is simply omitted); the OS dialog owns overwrite
     * confirmation. Appends the extension when the dialog did not (some Linux
     * dialogs don't enforce the filter), so `openWith` matches on `.bpmn`/`.dmn`.
     */
    private async promptNewModelTarget(
        title: string,
        filterLabel: string,
        ext: string,
    ): Promise<Uri | undefined> {
        const folder = workspace.workspaceFolders?.[0];
        const uri = await window.showSaveDialog({
            title,
            defaultUri: folder ? Uri.joinPath(folder.uri, `new-diagram.${ext}`) : undefined,
            filters: { [filterLabel]: [ext] },
        });
        if (!uri) {
            return undefined;
        }
        return uri.path.endsWith(`.${ext}`) ? uri : uri.with({ path: `${uri.path}.${ext}` });
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

    /**
     * Requests the SVG of the current BPMN diagram from the active webview and
     * copies it to the system clipboard.
     *
     * Disposes any previous SVG subscription before creating a new one to
     * prevent listener accumulation.
     */
    writeToClipboard(): void {
        this.requestSvg((svg) => {
            env.clipboard.writeText(svg);
        });
    }

    /**
     * Requests the SVG of the current BPMN diagram from the active webview and
     * writes it to a `.svg` file next to the `.bpmn` source file.
     *
     * Disposes any previous SVG subscription before creating a new one to
     * prevent listener accumulation.
     */
    writeToFile(): void {
        this.requestSvg(async (svg) => {
            const filePath = this.vsDocument
                .getFilePath(this.editorStore.getActiveEditorId())
                .replace(/\.bpmn$/, ".svg");
            await workspace.fs.writeFile(Uri.file(filePath), Buffer.from(svg));
            this.notifier.logInfo(`Diagram SVG exported to ${filePath}`);
        });
    }

    /**
     * Sends a `GetDiagramAsSVGCommand` to the active webview and subscribes
     * to the response.  Disposes any previously active SVG subscription first.
     *
     * @param onSvg Callback invoked with the SVG string once received. Its
     *   result is awaited so a rejected async sink (a failed `workspace.fs`
     *   file write, a denied clipboard write) reaches the channel instead of
     *   floating away as an unhandled rejection.
     */
    private requestSvg(onSvg: (svg: string) => void | Promise<void>): void {
        const activeId = this.editorStore.getActiveEditorId();

        this.editorStore.postMessage(activeId, new GetDiagramAsSVGCommand()).catch((error) => {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
        });

        // Dispose previous subscription to avoid accumulating listeners.
        this.svgSubscription?.dispose();

        this.svgSubscription = this.editorStore.subscribeToActiveEditorMessage(
            (message: Command) => {
                if (message.type === "GetDiagramAsSVGCommand") {
                    const cmd = message as GetDiagramAsSVGCommand;
                    if (cmd.svg && cmd.svg.length > 0) {
                        Promise.resolve(onSvg(cmd.svg)).catch((error) => {
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
