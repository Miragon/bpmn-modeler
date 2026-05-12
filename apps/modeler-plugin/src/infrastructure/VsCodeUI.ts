import { posix } from "path";

import { env, Uri, window, workspace } from "vscode";

import { UserCancelledError } from "../domain/errors";
import { MigrationScope } from "../domain/MigrationPlan";
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

    // ─── Quick-pick prompts ──────────────────────────────────────────────────

    /**
     * Shows a quick-pick prompt and returns the selected execution platform key.
     *
     * @param placeHolder Prompt text shown in the quick-pick widget.
     * @param items List of items to display (e.g. ["Camunda 7", "Camunda 8"]).
     * @returns `"c7"` for Camunda 7, `"c8"` for Camunda 8.
     * @throws {UserCancelledError} If the user dismisses the quick pick.
     * @throws {Error} If the user selects an unknown item.
     */
    async pickExecutionPlatform(
        placeHolder: string,
        items: string[],
    ): Promise<"c7" | "c8"> {
        const result = await window.showQuickPick(items, {
            placeHolder,
            onDidSelectItem: (item) => item,
        });

        if (result === undefined) {
            throw new UserCancelledError();
        } else if (result === "Camunda 7") {
            return "c7";
        } else if (result === "Camunda 8") {
            return "c8";
        } else {
            throw new Error(`Unknown execution platform version: "${result}"`);
        }
    }

    /**
     * Shows a quick-pick for choosing which diagrams to migrate when both
     * Camunda 7 and 8 files are present in the workspace.
     *
     * @param c7Count Number of Camunda 7 diagrams discovered.
     * @param c8Count Number of Camunda 8 diagrams discovered.
     * @returns The selected migration scope.
     * @throws {UserCancelledError} If the user dismisses the quick pick.
     */
    async pickMigrationScope(c7Count: number, c8Count: number): Promise<MigrationScope> {
        const items = [
            `Camunda 7 only (${c7Count} diagram${c7Count !== 1 ? "s" : ""})`,
            `Camunda 8 only (${c8Count} diagram${c8Count !== 1 ? "s" : ""})`,
            `Both (${c7Count + c8Count} diagram${c7Count + c8Count !== 1 ? "s" : ""})`,
        ];

        const result = await window.showQuickPick(items, {
            placeHolder: "Which diagrams do you want to migrate?",
        });

        if (result === undefined) {
            throw new UserCancelledError();
        } else if (result.startsWith("Camunda 7")) {
            return "c7";
        } else if (result.startsWith("Camunda 8")) {
            return "c8";
        } else {
            return "both";
        }
    }

    /**
     * Shows a quick-pick with available engine versions for the given platform.
     *
     * @param platform The execution platform (`"c7"` or `"c8"`).
     * @param versions The list of available versions to display.
     * @returns The selected version string.
     * @throws {UserCancelledError} If the user dismisses the quick pick.
     */
    async pickEngineVersion(
        platform: "c7" | "c8",
        versions: readonly string[],
    ): Promise<string> {
        const label = platform === "c7" ? "Camunda 7" : "Camunda 8";
        const result = await window.showQuickPick([...versions], {
            placeHolder: `Select ${label} engine version`,
        });

        if (result === undefined) {
            throw new UserCancelledError();
        }
        return result;
    }

    /**
     * Shows a quick-pick listing candidate files when several workspace files
     * declare the same process / decision id.  Sorted by workspace-relative
     * path so that nearby files surface first.
     *
     * @param paths Absolute file paths returned by the workspace search.
     * @returns The chosen path, or `undefined` if the user dismissed the
     *   pick.  Cancellation is *not* treated as an error here because the
     *   user is free to back out of a navigation prompt.
     */
    async pickReferencedModel(paths: string[]): Promise<string | undefined> {
        const items = paths
            .map((path) => ({
                label: posix.basename(path),
                description: workspace.asRelativePath(Uri.file(path)),
                path,
            }))
            .sort((a, b) => a.description.localeCompare(b.description));

        const picked = await window.showQuickPick(items, {
            placeHolder: "Select the referenced model to open",
        });
        return picked?.path;
    }
}
