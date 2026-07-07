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
     * Registers a marketplace at the caller-chosen scope. The controller decides
     * (via a quick pick), because scope is a user intent — `"workspace"` keeps the
     * entry a per-project concern in `.vscode/settings.json`; `"user"` promotes it
     * to "all my projects". A `"workspace"` request with no folder/workspace open
     * falls back to Global, because `update()` to Workspace throws without one.
     *
     * Dedup follows the effective-union rule: a `"workspace"` add is a no-op if the
     * URL exists in *either* scope (it already resolves for this project); a
     * `"user"` add de-dups only against the User list, so an entry that lives
     * workspace-level can still be promoted user-wide. Either way it appends only
     * to the **target scope's own** list from `inspect()` — never the union — so a
     * workspace write can't copy User-level entries into the repo's settings.
     *
     * String `includes` de-dups only against other strings, which is all the Add
     * command writes; a string that resolves to the same repo as an object entry
     * slips through, costing only a redundant fetch into the same cache slot.
     */
    async addMarketplace(url: string, scope: "workspace" | "user"): Promise<void> {
        const config = workspace.getConfiguration("miragon.bpmnModeler");
        const inspected = config.inspect<MarketplaceSettingsEntry[]>("marketplaces");
        const hasWorkspace =
            workspace.workspaceFolders !== undefined || workspace.workspaceFile !== undefined;
        const target =
            scope === "user" || !hasWorkspace
                ? ConfigurationTarget.Global
                : ConfigurationTarget.Workspace;
        if (target === ConfigurationTarget.Global) {
            // Promotion rule: only the User list de-dups a "user" add, so an entry
            // present workspace-level can still be lifted to "all my projects".
            if ((inspected?.globalValue ?? []).includes(url)) {
                return;
            }
            await config.update("marketplaces", [...(inspected?.globalValue ?? []), url], target);
            return;
        }
        // Workspace add: a no-op if the URL already resolves for this project via
        // either scope's list.
        if (this.getMarketplaces().includes(url)) {
            return;
        }
        await config.update(
            "marketplaces",
            [...(inspected?.workspaceValue ?? []), url],
            ConfigurationTarget.Workspace,
        );
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
