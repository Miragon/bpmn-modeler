import { commands, LogOutputChannel, ProgressLocation, Uri, window } from "vscode";

const LOG_CHANNEL_ID = "bpmn.modeler";
const LOG_PREFIX = `[${LOG_CHANNEL_ID}] `;

/**
 * Adapter for user-facing messages and diagnostic logging.
 *
 * Owns a single VS Code log output channel and the toast notification
 * API so services and controllers can surface information to the user
 * without importing from `vscode` directly.
 */
export class VsCodeNotifier {
    private readonly channel: LogOutputChannel;

    constructor() {
        this.channel = window.createOutputChannel(LOG_CHANNEL_ID, { log: true });
        this.channel.clear();
    }

    showInfo(message: string): void {
        window.showInformationMessage(message);
    }

    showError(message: string): void {
        window.showErrorMessage(message);
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

    logInfo(message: string): void {
        this.channel.info(LOG_PREFIX + message);
    }

    logWarning(message: string): void {
        this.channel.warn(LOG_PREFIX + message);
    }

    logError(error: Error): void {
        this.channel.error(LOG_PREFIX, error);
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
        await commands.executeCommand("vscode.open", Uri.file(absolutePath));
    }
}
