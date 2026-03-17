import { env, window } from "vscode";

import { VsCodeLogger, VsCodeTextEditor } from "./window";

/**
 * Aggregates all VS Code UI interactions: info/error messages, text-editor
 * toggling, and the output-channel logger.
 *
 * Replaces the three separate adapter classes `VsCodeDisplayMessageAdapter`,
 * `VsCodeTextEditorAdapter`, and `VsCodeLoggerAdapter`.
 */
export class VsCodeUI {
    private readonly textEditor = new VsCodeTextEditor();

    private readonly logger = new VsCodeLogger("bpmn.modeler");

    /**
     * Shows an information message in the VS Code notification area.
     *
     * @param message The message text to display.
     */
    showInfo(message: string): void {
        window.showInformationMessage(message);
    }

    /**
     * Shows an error message in the VS Code notification area.
     *
     * @param message The message text to display.
     */
    showError(message: string): void {
        window.showErrorMessage(message);
    }

    /**
     * Toggles the standard text editor for the given document.
     *
     * @param documentPath Absolute file system path of the document.
     * @returns `true` if the text editor was opened, `false` if it was closed.
     */
    toggleTextEditor(documentPath: string): Promise<boolean> {
        return this.textEditor.toggle(documentPath);
    }

    /**
     * Reads the current system clipboard text via the VS Code API.
     *
     * @returns The clipboard text content.
     */
    async readClipboard(): Promise<string> {
        return env.clipboard.readText();
    }

    /**
     * Writes the given text to the system clipboard via the VS Code API.
     *
     * @param text The text to write.
     */
    async writeClipboard(text: string): Promise<void> {
        await env.clipboard.writeText(text);
    }

    /**
     * Reveals the extension's output channel in the VS Code UI.
     */
    openLoggingConsole(): void {
        this.logger.open();
    }

    /**
     * Writes an informational message to the extension's output channel.
     *
     * @param message The message text to log.
     */
    logInfo(message: string): void {
        this.logger.info(message);
    }

    /**
     * Writes a warning message to the extension's output channel.
     *
     * @param message The message text to log.
     */
    logWarning(message: string): void {
        this.logger.warn(message);
    }

    /**
     * Writes an error to the extension's output channel.
     *
     * @param error The error to log.
     */
    logError(error: Error): void {
        this.logger.error(error);
    }
}
