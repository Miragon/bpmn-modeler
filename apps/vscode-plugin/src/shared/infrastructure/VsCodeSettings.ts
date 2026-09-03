import { ConfigurationTarget, workspace } from "vscode";

import { MarketplaceSettingsEntry, SettingsPort } from "@miragon/bpmn-modeler-core";

/**
 * Pure VS Code workspace configuration reader for the BPMN modeler.
 */
export class VsCodeSettings implements SettingsPort {
    getAlignToOrigin(): boolean {
        return (
            workspace.getConfiguration("miragon.bpmnModeler").get<boolean>("alignToOrigin") ?? false
        );
    }

    getShowTransactionBoundaries(): boolean {
        return (
            workspace
                .getConfiguration("miragon.bpmnModeler")
                .get<boolean>("showTransactionBoundaries") ?? true
        );
    }

    /**
     * Whether bpmnlint runs. Defaults to `true`, so automation users keep the
     * zero-config lint experience; design-only users flip it off (globally, from
     * the webview pill or the settings UI) to silence rules they do not use.
     */
    getLintingEnabled(): boolean {
        return (
            workspace.getConfiguration("miragon.bpmnModeler").get<boolean>("linting.enabled") ??
            true
        );
    }

    getConfigFolder(): string {
        return workspace
            .getConfiguration("miragon.bpmnModeler")
            .get<string>("configFolder", ".camunda");
    }

    getC8ApiVersion(): string {
        return workspace.getConfiguration("miragon.bpmnModeler").get<string>("c8ApiVersion", "v2");
    }

    getColorTheme(): "automatic" | "light" {
        const value = workspace
            .getConfiguration("miragon.bpmnModeler")
            .get<string>("colorTheme", "automatic");
        return value === "light" ? "light" : "automatic";
    }

    getFavouriteBpmnElements(): string[] {
        return workspace
            .getConfiguration("miragon.bpmnModeler")
            .get<string[]>("favouriteBpmnElements", []);
    }

    /**
     * Whether tasks, call activities and collapsed sub-processes get resize
     * handles. Defaults to `false`: bpmn-js deliberately fixes those shapes, so
     * the handles are opt-in for people who lay diagrams out by hand.
     */
    getResizableActivities(): boolean {
        return (
            workspace.getConfiguration("miragon.bpmnModeler").get<boolean>("resizableActivities") ??
            false
        );
    }

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
        return this.getMarketplacesWithScopes().map((e) => e.entry);
    }

    /**
     * The deduped union of registered marketplaces, each annotated with the
     * scope(s) it lives in (User first, since the union orders User before
     * Workspace). The Remove Marketplace command needs this: one picker item per
     * union entry, with a description naming where the entry is registered, and a
     * removal that deletes it from *every* scope it appears in.
     *
     * Dedup is by {@link entryKey} — the same structural key {@link getMarketplaces}
     * uses — so the picker's identity can never drift from what removal matches.
     */
    getMarketplacesWithScopes(): {
        entry: MarketplaceSettingsEntry;
        scopes: ("user" | "workspace")[];
    }[] {
        const inspected = workspace
            .getConfiguration("miragon.bpmnModeler")
            .inspect<MarketplaceSettingsEntry[]>("marketplaces");
        // User first so a shared "all my projects" entry annotated with both
        // scopes still reads "User and Workspace settings", not the reverse.
        const scoped: [MarketplaceSettingsEntry, "user" | "workspace"][] = [
            ...(inspected?.globalValue ?? []).map(
                (entry) => [entry, "user"] as [MarketplaceSettingsEntry, "user"],
            ),
            ...(inspected?.workspaceValue ?? []).map(
                (entry) => [entry, "workspace"] as [MarketplaceSettingsEntry, "workspace"],
            ),
        ];
        const byKey = new Map<
            string,
            { entry: MarketplaceSettingsEntry; scopes: ("user" | "workspace")[] }
        >();
        for (const [entry, scope] of scoped) {
            const key = entryKey(entry);
            const existing = byKey.get(key);
            if (existing) {
                existing.scopes.push(scope);
            } else {
                byKey.set(key, { entry, scopes: [scope] });
            }
        }
        return [...byKey.values()];
    }

    /**
     * Unregisters the given marketplaces from every scope they appear in. Each
     * scope's own list from `inspect()` is filtered independently, and written
     * back only when it actually changed — an emptied list is written as
     * `undefined` so the `marketplaces` key is removed from that `settings.json`
     * rather than left as a stray `[]`.
     *
     * Matching is by {@link entryKey}, the same structural key the picker dedups
     * on, so an object entry (self-hosted GHE/GitLab) is matched by shape, not
     * reference. No-workspace safety is implicit: with no folder open the
     * Workspace scope's `workspaceValue` is `undefined`, so its update is never
     * attempted and VS Code never throws.
     */
    async removeMarketplaces(entries: readonly MarketplaceSettingsEntry[]): Promise<void> {
        const config = workspace.getConfiguration("miragon.bpmnModeler");
        const inspected = config.inspect<MarketplaceSettingsEntry[]>("marketplaces");
        const removeKeys = new Set(entries.map((entry) => entryKey(entry)));

        await this.removeFromScope(
            config,
            inspected?.globalValue,
            removeKeys,
            ConfigurationTarget.Global,
        );
        await this.removeFromScope(
            config,
            inspected?.workspaceValue,
            removeKeys,
            ConfigurationTarget.Workspace,
        );
    }

    /**
     * Filters one scope's own list and writes it back only if it shrank, so a
     * scope that never held any of the removed entries is left untouched (no
     * redundant `update` that would dirty its `settings.json`). An emptied list
     * is written as `undefined` to drop the key entirely.
     */
    private async removeFromScope(
        config: ReturnType<typeof workspace.getConfiguration>,
        current: MarketplaceSettingsEntry[] | undefined,
        removeKeys: ReadonlySet<string>,
        target: ConfigurationTarget,
    ): Promise<void> {
        if (current === undefined) {
            return;
        }
        const filtered = current.filter((entry) => !removeKeys.has(entryKey(entry)));
        if (filtered.length === current.length) {
            return;
        }
        await config.update("marketplaces", filtered.length > 0 ? filtered : undefined, target);
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
 * The structural identity of a settings entry, shared by the picker's dedup and
 * the removal's matching so the two can never drift. Objects (self-hosted
 * GHE/GitLab) can't use referential/`Set<string>` identity, so a serialized key
 * is the simplest stable comparison. Key order is significant for object entries
 * — two entries differing only in field order read as distinct — which is
 * consistent across dedup, the picker, and removal because all three route
 * through this one function.
 */
function entryKey(entry: MarketplaceSettingsEntry): string {
    return JSON.stringify(entry);
}
