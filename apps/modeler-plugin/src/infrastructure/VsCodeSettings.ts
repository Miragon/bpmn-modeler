import { workspace } from "vscode";

/** Pure VS Code workspace configuration reader for the BPMN modeler. */
export class VsCodeSettings {
    /**
     * Reads the alignToOrigin setting from VS Code configuration.
     * @returns `true` if align-to-origin is enabled, `false` otherwise.
     */
    getAlignToOrigin(): boolean {
        return (
            workspace
                .getConfiguration("miragon.bpmnModeler")
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
     * Reads the UI language setting from VS Code configuration.
     *
     * Defaults to `"en"` (English) if the setting is not configured.
     *
     * @returns The locale code (e.g. `"de"`, `"fr"`).
     */
    getLanguage(): string {
        return workspace
            .getConfiguration("miragon.bpmnModeler")
            .get<string>("language", "en");
    }
}
