import { commands, ExtensionContext } from "vscode";

import { OpenAllScriptTasksQuery } from "@miragon/bpmn-modeler-shared";
import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";

/** VS Code command ID for opening every inline script task of the active diagram. */
export const OPEN_ALL_SCRIPT_TASKS_CMD = "bpmn-modeler.openAllScriptTasks";

/**
 * Registers the "Generate Script Files for Script Tasks" command.
 *
 * The command only kicks off the flow: it posts an {@link OpenAllScriptTasksQuery}
 * to the active editor's webview and returns. The reply
 * ({@link OpenScriptEditorsCommand}) is handled by the permanently-registered
 * router handler, so — unlike the SVG export command — no one-shot reply
 * subscription is needed here, and re-running the command can never leak or
 * double-register a listener.
 *
 * Lives in the scriptTask feature rather than the modeler's `CommandController`
 * to keep the feature's command surface owned by the feature (feature isolation).
 */
export class ScriptTaskCommandController {
    /**
     * @param editorStore Registry of open editors; supplies the active editor
     *   and the message channel to its webview.
     * @param notifier User-facing message and logging helper.
     */
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: VsCodeNotifier,
    ) {}

    /**
     * Registers the command and pushes its disposable into the extension context.
     */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(OPEN_ALL_SCRIPT_TASKS_CMD, this.openAll, this),
        );
    }

    /**
     * Asks the active BPMN webview to enumerate its inline script tasks.
     *
     * `getActiveEditorId` throws "No active editor." and `postMessage` throws
     * "The active editor is hidden." — both are user error (the palette runs the
     * command with no diagram focused), so they are logged and answered with a
     * hint rather than surfaced as an error toast.
     */
    private async openAll(): Promise<void> {
        try {
            const activeId = this.editorStore.getActiveEditorId();
            await this.editorStore.postMessage(activeId, new OpenAllScriptTasksQuery());
        } catch (error) {
            this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            this.notifier.showInfo("Focus a BPMN diagram tab, then run the command again.");
        }
    }
}
