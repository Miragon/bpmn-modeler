import { window } from "vscode";

import { VsCodeLogger, VsCodeTextEditor } from "./window";

/**
 * Adapter for user-facing messages and diagnostic logging.
 *
 * Bundles the toast notification API, the output-channel logger, and the
 * companion text-editor toggle so services and controllers can surface
 * information to the user without importing from `vscode` directly.
 * `VsCodeLogger` remains an internal collaborator — clients never see it.
 */
export class VsCodeNotifier {
    private readonly textEditor = new VsCodeTextEditor();

    private readonly logger = new VsCodeLogger("bpmn.modeler");

    showInfo(message: string): void {
        window.showInformationMessage(message);
    }

    showError(message: string): void {
        window.showErrorMessage(message);
    }

    toggleTextEditor(documentPath: string): Promise<boolean> {
        return this.textEditor.toggle(documentPath);
    }

    openLoggingConsole(): void {
        this.logger.open();
    }

    logInfo(message: string): void {
        this.logger.info(message);
    }

    logWarning(message: string): void {
        this.logger.warn(message);
    }

    logError(error: Error): void {
        this.logger.error(error);
    }
}
