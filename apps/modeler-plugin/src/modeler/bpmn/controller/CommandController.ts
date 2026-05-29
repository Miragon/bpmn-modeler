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

import { EditorSubscription } from "../../../shared/domain/EditorSession";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";
import { VsCodeDocument } from "../../../shared/infrastructure/VsCodeDocument";
import { VsCodeNotifier } from "../../../shared/infrastructure/VsCodeNotifier";
import { VsCodeTextEditor } from "../../../shared/infrastructure/VsCodeTextEditor";
import { BpmnModelerService } from "../service/BpmnModelerService";
import { BpmnMigrationService } from "../../../migration/index";

// VS Code command ID for toggling the text editor.
const TOGGLE_CMD = "bpmn-modeler.toggleTextEditor";
// VS Code command ID for opening the logging console.
const LOGGING_CMD = "bpmn-modeler.openLoggingConsole";
// VS Code command ID for copying the diagram as SVG to the clipboard.
const COPY_SVG_CMD = "bpmn-modeler.copyDiagramAsSvg";
// VS Code command ID for saving the diagram as an SVG file.
const SAVE_SVG_CMD = "bpmn-modeler.saveDiagramAsSvgCommand";
// VS Code command ID for changing the engine version.
const CHANGE_ENGINE_VERSION_CMD = "bpmn-modeler.changeEngineVersion";
// VS Code command ID for migrating all BPMN diagrams in the workspace.
const MIGRATE_ALL_CMD = "bpmn-modeler.migrateAllDiagrams";
// VS Code command ID for changing the modeler language.
const CHANGE_LANGUAGE_CMD = "bpmn-modeler.changeLanguage";

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
     */
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: VsCodeDocument,
        private readonly notifier: VsCodeNotifier,
        private readonly textEditor: VsCodeTextEditor,
        private readonly bpmnService: BpmnModelerService,
        private readonly migrationSvc: BpmnMigrationService,
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
        const activeId = this.editorStore.getActiveEditorId();
        return this.bpmnService.changeEngineVersion(activeId);
    }

    /**
     * Migrates all BPMN diagrams in the workspace to a user-selected version.
     *
     * Delegates to {@link BpmnMigrationService.migrateAllDiagrams}.
     */
    migrateAllDiagrams(): Promise<boolean> {
        return this.migrationSvc.migrateAllDiagrams();
    }

    /**
     * Prompts the user to select a UI language for the active modeler webview.
     *
     * Shows a QuickPick with all supported languages and sends the selected
     * locale to the active webview via {@link BpmnModelerService.setLanguage}.
     */
    async changeLanguage(): Promise<void> {
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
        this.requestSvg((svg) => {
            const filePath = this.vsDocument
                .getFilePath(this.editorStore.getActiveEditorId())
                .replace(/\.bpmn$/, ".svg");
            workspace.fs.writeFile(Uri.file(filePath), Buffer.from(svg));
        });
    }

    /**
     * Sends a `GetDiagramAsSVGCommand` to the active webview and subscribes
     * to the response.  Disposes any previously active SVG subscription first.
     *
     * @param onSvg Callback invoked with the SVG string once received.
     */
    private requestSvg(onSvg: (svg: string) => void): void {
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
                        onSvg(cmd.svg);
                    }
                    // Dispose after receiving the response.
                    this.svgSubscription?.dispose();
                    this.svgSubscription = undefined;
                }
            },
        );
    }
}
