import { Disposable, LogOutputChannel, window } from "vscode";

/**
 * Slim VS Code UI helper for the bpmn-iq plugin.
 *
 * Aggregates the user-facing notifications and the output-channel logger so
 * controller/service code stays concise.
 */
export class VsCodeUI implements Disposable {
    private readonly prefix = "[bpmn-iq] ";

    private readonly logger: LogOutputChannel;

    constructor() {
        this.logger = window.createOutputChannel("bpmn-iq", { log: true });
    }

    dispose(): void {
        this.logger.dispose();
    }

    showInfo(message: string): void {
        window.showInformationMessage(message);
    }

    showError(message: string): void {
        window.showErrorMessage(message);
    }

    logInfo(message: string): void {
        this.logger.info(this.prefix + message);
    }

    logWarning(message: string): void {
        this.logger.warn(this.prefix + message);
    }

    logError(error: Error): void {
        this.logger.error(this.prefix, error);
    }
}
