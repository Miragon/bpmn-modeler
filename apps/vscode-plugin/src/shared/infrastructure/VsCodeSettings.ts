import { ConfigurationTarget, workspace } from "vscode";

import { MarketplaceSettingsEntry, SettingsPort } from "@miragon/bpmn-modeler-core";

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

    /**
     * Whether to offer Camunda SPIN globals (`S(…)`, `JSON(…)`) and SpinJsonNode
     * member completion in inline Camunda 7 scripts.
     *
     * Defaults to `true`: SPIN ships with Camunda 7 and JSON variables are
     * common, so the globals are useful out of the box. Disable when the
     * project does not have camunda-spin on the classpath.
     */
    getScriptingSpin(): boolean {
        return (
            workspace.getConfiguration("miragon.bpmnModeler").get<boolean>("scripting.spin") ?? true
        );
    }

    /**
     * The union of the User- and Workspace-level marketplace lists (User first),
     * deduped structurally. Forwards the raw entries (URL/path strings, or object
     * entries for self-hosted GHE / GitLab); the domain parser validates each shape.
     *
     * `get()` returns only the effective scope — for an array VS Code shadow-
     * *replaces* rather than merges across scopes, so a workspace list would hide
     * the User list entirely. `inspect()` exposes both scopes so we can union them,
     * letting User-level entries act as "all my projects" while the workspace adds
     * project-specific ones.
     */
    getMarketplaces(): MarketplaceSettingsEntry[] {
        const inspected = workspace
            .getConfiguration("miragon.bpmnModeler")
            .inspect<MarketplaceSettingsEntry[]>("marketplaces");
        return dedupeEntries([
            ...(inspected?.globalValue ?? []),
            ...(inspected?.workspaceValue ?? []),
        ]);
    }

    /**
     * Registers a marketplace, defaulting to Workspace scope so it stays a
     * per-project concern (User scope = "all my projects"). Falls back to Global
     * when no folder/workspace is open, because `update()` to Workspace throws
     * without one.
     *
     * De-dups against the *union* (so re-adding one that already lives in the
     * other scope is a no-op), but appends only to the **target scope's own**
     * list from `inspect()` — never the union — so a workspace write can't copy
     * User-level entries into the repo's `.vscode/settings.json`.
     *
     * String `includes` de-dups only against other strings, which is all the Add
     * command writes; a string that resolves to the same repo as an object entry
     * slips through, costing only a redundant fetch into the same cache slot.
     */
    async addMarketplace(url: string): Promise<void> {
        if (this.getMarketplaces().includes(url)) {
            return;
        }
        const config = workspace.getConfiguration("miragon.bpmnModeler");
        const inspected = config.inspect<MarketplaceSettingsEntry[]>("marketplaces");
        const hasWorkspace =
            workspace.workspaceFolders !== undefined || workspace.workspaceFile !== undefined;
        const target = hasWorkspace ? ConfigurationTarget.Workspace : ConfigurationTarget.Global;
        const scopeList = hasWorkspace
            ? (inspected?.workspaceValue ?? [])
            : (inspected?.globalValue ?? []);
        await config.update("marketplaces", [...scopeList, url], target);
    }
}

/**
 * Dedupes settings entries by a structural key so an entry present in both the
 * User and Workspace scope is fetched once. Objects (self-hosted GHE/GitLab)
 * can't use referential/`Set<string>` identity, so a serialized key is the
 * simplest stable comparison.
 */
function dedupeEntries(entries: MarketplaceSettingsEntry[]): MarketplaceSettingsEntry[] {
    const seen = new Set<string>();
    return entries.filter((entry) => {
        const key = JSON.stringify(entry);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
