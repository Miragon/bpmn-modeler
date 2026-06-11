import { workspace } from "vscode";

import { SettingsPort } from "@miragon/bpmn-modeler-core";

/**
 * Pure VS Code workspace configuration reader for the BPMN modeler.
 */
export class VsCodeSettings implements SettingsPort {
    /**
     * Reads the alignToOrigin setting from VS Code configuration.
     * @returns `true` if align-to-origin is enabled, `false` otherwise.
     */
    getAlignToOrigin(): boolean {
        return (
            workspace.getConfiguration("miragon.bpmnModeler").get<boolean>("alignToOrigin") ?? false
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
        return workspace.getConfiguration("miragon.bpmnModeler").get<string>("c8ApiVersion", "v2");
    }

    /**
     * Reads the color theme mode from VS Code configuration.
     *
     * Defaults to `"automatic"` if the setting is not configured.
     *
     * @returns `"automatic"` to follow VS Code theme, or `"light"` for always-light.
     */
    getColorTheme(): "automatic" | "light" {
        const value = workspace
            .getConfiguration("miragon.bpmnModeler")
            .get<string>("colorTheme", "automatic");
        return value === "light" ? "light" : "automatic";
    }

    /**
     * Reads the favourite BPMN element types from VS Code configuration.
     *
     * Defaults to an empty array if not configured.
     *
     * @returns Array of BPMN type strings (e.g. `["bpmn:ServiceTask"]`).
     */
    getFavouriteBpmnElements(): string[] {
        return workspace
            .getConfiguration("miragon.bpmnModeler")
            .get<string[]>("favouriteBpmnElements", []);
    }

    /**
     * Reads the UI language setting from VS Code configuration.
     *
     * Defaults to `"en"` (English) if the setting is not configured.
     *
     * @returns The locale code (e.g. `"de"`, `"fr"`).
     */
    getLanguage(): string {
        return workspace.getConfiguration("miragon.bpmnModeler").get<string>("language", "en");
    }

    /**
     * Whether to persist the activity→code map to disk under
     * `<configFolder>/code-link/`.
     *
     * Defaults to `false`: the in-memory map (context-pad visibility + live
     * linking) works regardless; the on-disk file is an opt-in warm cache and
     * external-tooling artifact.
     */
    getPersistCodeLinkMap(): boolean {
        return (
            workspace.getConfiguration("miragon.bpmnModeler").get<boolean>("persistCodeLinkMap") ??
            false
        );
    }
}
