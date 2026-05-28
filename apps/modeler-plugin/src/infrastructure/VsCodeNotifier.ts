import { LogOutputChannel, window } from "vscode";

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
}
