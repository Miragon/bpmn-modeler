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
import { supportedModelerLanguages } from "@miragon/bpmn-modeler-i18n-extras";

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

export const TOGGLE_CMD = "bpmn-modeler.toggleTextEditor";
export const LOGGING_CMD = "bpmn-modeler.openLoggingConsole";
export const COPY_SVG_CMD = "bpmn-modeler.copyDiagramAsSvg";
export const SAVE_SVG_CMD = "bpmn-modeler.saveDiagramAsSvgCommand";
export const CHANGE_ENGINE_VERSION_CMD = "bpmn-modeler.changeEngineVersion";
export const MIGRATE_ALL_CMD = "bpmn-modeler.migrateAllDiagrams";
export const CHANGE_LANGUAGE_CMD = "bpmn-modeler.changeLanguage";
export const TOGGLE_LINTING_CMD = "bpmn-modeler.toggleLinting";
export const NEW_BPMN_MODEL_CMD = "bpmn-modeler.newBpmnModel";
export const NEW_DMN_MODEL_CMD = "bpmn-modeler.newDmnModel";
// Manual fallback
// for setups where the element-template file watcher never fires (WSL +
// symlinked workspace): a reload re-requests the templates from the host.
export const RELOAD_MODELER_CMD = "bpmn-modeler.reloadModeler";

/**
 * Registers and handles all VS Code command contributions for the modeler.
 */
export class CommandController {
    private svgSubscription: EditorSubscription | undefined;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: VsCodeDocument,
        private readonly notifier: VsCodeNotifier,
        private readonly textEditor: VsCodeTextEditor,
        private readonly bpmnService: BpmnModelerService,
        private readonly migrationSvc: BpmnMigrationService,
        private readonly picker: VsCodePicker,
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
            commands.registerCommand(NEW_BPMN_MODEL_CMD, this.newBpmnModel, this),
            commands.registerCommand(NEW_DMN_MODEL_CMD, this.newDmnModel, this),
            commands.registerCommand(RELOAD_MODELER_CMD, this.reloadModeler, this),
        );
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
    reloadModeler(): void {
        this.editorStore.reload(this.editorStore.getActiveEditorId());
    }

    /** Reveals the extension's output channel. */
    showLogging(): void {
        this.notifier.openLoggingConsole();
    }

    /** Prompts for a new engine version for the active BPMN editor. */
    changeEngineVersion(): Promise<boolean> {
        return this.logAndRethrow(() =>
            this.bpmnService.changeEngineVersion(this.editorStore.getActiveEditorId()),
        );
    }

    /** Migrates all workspace BPMN diagrams to a user-selected version. */
    migrateAllDiagrams(): Promise<boolean> {
        return this.logAndRethrow(() => this.migrationSvc.migrateAllDiagrams());
    }

    /** Prompts for a UI language and applies it to the active modeler webview. */
    changeLanguage(): Promise<void> {
        return this.logAndRethrow(async () => {
            const items = supportedModelerLanguages.map((lang) => ({
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
     * Flips `miragon.bpmnModeler.linting.enabled` (default on) at Global (User)
     * scope — the design-only opt-out. Reachable from the command palette and
     * the "BPMNlint: off" status-bar badge; the webview pill writes the same
     * setting directly. The config change re-lints every open editor, so no
     * webview message is sent from here.
     */
    toggleLinting(): Promise<void> {
        return this.logAndRethrow(async () => {
            const config = workspace.getConfiguration("miragon.bpmnModeler");
            const enabled = config.get<boolean>("linting.enabled") ?? true;
            await config.update("linting.enabled", !enabled, ConfigurationTarget.Global);
            this.notifier.logInfo(`BPMN linting ${!enabled ? "enabled" : "disabled"}`);
        });
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
            const target = await this.promptNewModelTarget("New BPMN Model", "BPMN", "bpmn");
            if (!target) {
                return; // dialog dismissed — silent no-op
            }

            let doc: BpmnDocument;
            try {
                const engine = await this.picker.pickExecutionPlatform("Select the engine.", [
                    "c7",
                    "c8",
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

    /** Scaffolds a new DMN model and opens it. DMN has no engine choice, so no quick-pick. */
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

    /** Requests the current diagram's SVG from the active webview and copies it to the clipboard. */
    writeToClipboard(): void {
        this.requestSvg((svg) => {
            env.clipboard.writeText(svg);
        });
    }

    /** Requests the current diagram's SVG and writes it to a `.svg` next to the `.bpmn` source. */
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
     * Sends a `GetDiagramAsSVGCommand` to the active webview and subscribes to the
     * response, disposing any previously active SVG subscription first. `onSvg`'s
     * result is awaited so a rejected async sink (a failed `workspace.fs` write, a
     * denied clipboard write) reaches the channel instead of floating away as an
     * unhandled rejection.
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
