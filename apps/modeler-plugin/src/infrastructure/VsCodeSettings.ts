import { StatusBarAlignment, StatusBarItem, window, workspace } from "vscode";

import { UserCancelledError } from "../domain/errors";

/** VS Code configuration and quick-pick helpers for the BPMN modeler. */
export class VsCodeSettings {
    /** Lazily created status bar item for element-template loading feedback. */
    private templateStatusItem: StatusBarItem | undefined;

    /**
     * Reads the alignToOrigin setting from VS Code configuration.
     * @returns `true` if align-to-origin is enabled, `false` otherwise.
     */
    getAlignToOrigin(): boolean {
        return (
            workspace
                .getConfiguration("miragon.camundaModeler")
                .get<boolean>("alignToOrigin") ?? false
        );
    }

    /**
     * Reads the showTransactionBoundaries setting from VS Code configuration.
     * @returns `true` if transaction boundaries should be shown (default), `false` otherwise.
     */
    getShowTransactionBoundaries(): boolean {
        return (
            workspace
                .getConfiguration("miragon.bpmnModeler")
                .get<boolean>("showTransactionBoundaries") ?? true
        );
    }

    /**
     * Reads the config folder name from VS Code configuration.
     *
     * Defaults to `.camunda` if the setting is not configured.
     *
     * @returns The config folder name (e.g. `.camunda`).
     */
    getConfigFolder(): string {
        return workspace
            .getConfiguration("miragon.bpmnModeler")
            .get<string>("configFolder", ".camunda");
    }

    /**
     * Reads the Camunda 8 REST API version prefix from VS Code configuration.
     *
     * Defaults to `"v2"` if the setting is not configured.
     *
     * @returns The API version string (e.g. `"v2"`).
     */
    getC8ApiVersion(): string {
        return workspace
            .getConfiguration("miragon.bpmnModeler")
            .get<string>("c8ApiVersion", "v2");
    }

    /**
     * Shows a quick-pick prompt and returns the selected execution platform key.
     *
     * @param placeHolder Prompt text shown in the quick-pick widget.
     * @param items List of items to display (e.g. ["Camunda 7", "Camunda 8"]).
     * @returns `"c7"` for Camunda 7, `"c8"` for Camunda 8.
     * @throws {Error} If the user cancels or selects an unknown item.
     */
    async getExecutionPlatformVersion(
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
     * Shows a spinning status bar item indicating that element templates are
     * being discovered in the background.
     *
     * The item is created lazily on first use and reused across calls.
     */
    showElementTemplatesLoading(): void {
        const item = this.getOrCreateTemplateStatusItem();
        item.text = "$(loading~spin) Loading element templates…";
        item.show();
    }

    /**
     * Updates the status bar item to show the number of loaded element
     * templates and hides it automatically after 3 seconds.
     *
     * @param count Number of element templates that were loaded.
     */
    showElementTemplatesReady(count: number): void {
        const item = this.getOrCreateTemplateStatusItem();
        item.text = `$(check) Element templates (${count})`;
        item.show();
        setTimeout(() => item.hide(), 3000);
    }

    /**
     * Hides the element-templates status bar item.
     *
     * Called on error paths to ensure the loading indicator is not left visible.
     */
    hideElementTemplatesStatus(): void {
        this.templateStatusItem?.hide();
    }

    /**
     * Returns the existing status bar item or creates a new one on first use.
     *
     * @returns The (possibly newly created) status bar item.
     */
    private getOrCreateTemplateStatusItem(): StatusBarItem {
        if (!this.templateStatusItem) {
            this.templateStatusItem = window.createStatusBarItem(
                StatusBarAlignment.Left,
                100,
            );
        }
        return this.templateStatusItem;
    }
}
