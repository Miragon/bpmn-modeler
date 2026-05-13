import { StatusBarAlignment, StatusBarItem, window } from "vscode";

/** VS Code command ID for changing the engine version via the status bar click. */
const CHANGE_ENGINE_VERSION_CMD = "bpmn-modeler.changeEngineVersion";

/**
 * Manages the VS Code status bar items for the BPMN modeler: element-template
 * loading feedback and the current engine version indicator.
 */
export class VsCodeStatusBar {
    /** Lazily created status bar item for element-template loading feedback. */
    private templateStatusItem: StatusBarItem | undefined;

    /** Lazily created status bar item for displaying the current engine version. */
    private engineVersionStatusItem: StatusBarItem | undefined;

    // ─── Element templates status ────────────────────────────────────────────

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

    // ─── Engine version status ───────────────────────────────────────────────

    /**
     * Updates the engine-version status bar item to show the current platform
     * and version (e.g. `"Camunda 8 (8.8.0)"`).
     *
     * @param platform The execution platform identifier.
     * @param version The current engine version string.
     */
    showEngineVersion(platform: "c7" | "c8", version: string): void {
        const item = this.getOrCreateEngineVersionStatusItem();
        const label = platform === "c7" ? "Camunda 7" : "Camunda 8";
        item.text = `$(server-environment) ${label} (${version})`;
        item.tooltip = "Click to change engine version";
        item.show();
    }

    /**
     * Hides the engine-version status bar item.
     *
     * Called when switching to a non-BPMN editor or closing the last BPMN tab.
     */
    hideEngineVersion(): void {
        this.engineVersionStatusItem?.hide();
    }

    /**
     * Disposes the engine-version status bar item.
     *
     * Called on extension deactivation to free VS Code resources.
     */
    disposeEngineVersionStatus(): void {
        this.engineVersionStatusItem?.dispose();
        this.engineVersionStatusItem = undefined;
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    /**
     * Returns the existing status bar item or creates a new one on first use.
     *
     * @returns The (possibly newly created) status bar item.
     */
    private getOrCreateTemplateStatusItem(): StatusBarItem {
        if (!this.templateStatusItem) {
            this.templateStatusItem = window.createStatusBarItem(StatusBarAlignment.Left, 100);
        }
        return this.templateStatusItem;
    }

    /**
     * Returns the existing engine-version status bar item or creates a new one.
     *
     * The item's `command` is wired to the change-engine-version command so
     * clicking it opens the version quick pick.
     *
     * @returns The (possibly newly created) status bar item.
     */
    private getOrCreateEngineVersionStatusItem(): StatusBarItem {
        if (!this.engineVersionStatusItem) {
            this.engineVersionStatusItem = window.createStatusBarItem(
                StatusBarAlignment.Right,
                200,
            );
            this.engineVersionStatusItem.command = CHANGE_ENGINE_VERSION_CMD;
        }
        return this.engineVersionStatusItem;
    }
}
