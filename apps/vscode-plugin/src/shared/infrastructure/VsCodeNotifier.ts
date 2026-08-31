import { commands, LogOutputChannel, ProgressLocation, Uri, window } from "vscode";

import { NotifierPort } from "@miragon/bpmn-modeler-core";

const LOG_CHANNEL_ID = "bpmn.modeler";

/**
 * Adapter for user-facing messages and diagnostic logging.
 *
 * Owns a single VS Code {@link LogOutputChannel} and the toast notification
 * API so services and controllers can surface information to the user
 * without importing from `vscode` directly.
 *
 * The channel is created with `{ log: true }`, so VS Code supplies the level
 * filtering (Output panel gear / *Developer: Set Log Level…*), per-line
 * timestamps, and persistence to the extension log file. The channel identifies
 * itself, so lines carry no channel-name prefix; the ctor does not `clear()`, so
 * the previous session's trail survives a reload.
 */
export class VsCodeNotifier implements NotifierPort {
    private readonly channel: LogOutputChannel;

    constructor() {
        this.channel = window.createOutputChannel(LOG_CHANNEL_ID, { log: true });
    }

    showInfo(message: string): void {
        window.showInformationMessage(message);
    }

    showError(message: string): void {
        window.showErrorMessage(message);
    }

    /**
     * Surfaces an error toast carrying a single "Reload Window" action.
     *
     * A configuration contribution added by an in-place extension update only
     * enters the *window's* registry on a full window reload; until then a write
     * to the new key raises VS Code's ERROR_UNKNOWN_KEY. Restarting the
     * extension host does not refresh the registry — only a reload does — so we
     * offer that reload directly rather than leaving the user to discover it.
     */
    async showErrorWithReload(message: string): Promise<void> {
        const reload = "Reload Window";
        const choice = await window.showErrorMessage(message, reload);
        if (choice === reload) {
            await commands.executeCommand("workbench.action.reloadWindow");
        }
    }

    /**
     * Logs `error` and surfaces a toast that pairs a caller-supplied
     * `context` line with the error's own message. Centralises the
     * log-then-show pattern so each service only specifies what it was
     * doing rather than re-deriving the message format.
     */
    notifyError(context: string, error: Error): void {
        this.logError(error);
        this.showError(`${context}\n${error.message ?? error}`);
    }

    openLoggingConsole(): void {
        this.channel.show(true);
    }

    logDebug(message: string): void {
        this.channel.debug(message);
    }

    logInfo(message: string): void {
        this.channel.info(message);
    }

    logWarning(message: string): void {
        this.channel.warn(message);
    }

    /**
     * A `string` is passed through untouched so a webview-forwarded stack prints
     * verbatim; an `Error` keeps VS Code's own formatting (message + stack).
     */
    logError(error: string | Error): void {
        this.channel.error(error);
    }

    /**
     * Runs `task` while showing a status-bar progress indicator titled
     * `title`. Status-bar location (`ProgressLocation.Window`) is the only
     * surface this adapter exposes — the modal/notification variants belong
     * on a future Picker or modal helper if a caller ever needs them.
     */
    withProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
        return Promise.resolve(
            window.withProgress({ location: ProgressLocation.Window, title }, task),
        );
    }

    /**
     * Opens the file at `absolutePath` in its registered (custom) editor via
     * the built-in `vscode.open` command. Centralised here so service callers
     * stay free of `commands` and `Uri`.
     */
    async openDocument(absolutePath: string): Promise<void> {
        await commands.executeCommand("vscode.open", Uri.file(absolutePath), {
            preview: false,
        });
    }
}
