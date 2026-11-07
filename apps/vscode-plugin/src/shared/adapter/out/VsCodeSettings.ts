import { posix } from "node:path";

import { ConfigurationTarget, workspace } from "vscode";

import {
    MarketplaceScope,
    MarketplaceSettingsEntry,
    ModelerSettingsSnapshot,
    parseSetting,
    registeredMarketplaces,
    RegistrationsByScope,
    settingKeyOf,
    SettingsPlace,
    SettingsPort,
    withoutMarketplaceEntries,
} from "@miragon/bpmn-modeler-core";
import { ColorThemeSetting, SurfaceMode } from "@miragon/bpmn-modeler-types";

import { lintingEnabled, ModelerConfiguration, modelerConfiguration } from "./modelerConfiguration";

/**
 * Reads and writes the modeler configuration in VS Code. Each value is read
 * under the key `settingKeyOf` names and parsed as the core's `parseSetting`
 * decides, as on every host; the marketplace commands write their lists here.
 */
export class VsCodeSettings implements SettingsPort {
    getAlignToOrigin(): boolean {
        return readSetting("alignToOrigin");
    }

    getShowTransactionBoundaries(): boolean {
        return readSetting("showTransactionBoundaries");
    }

    getLintingEnabled(): boolean {
        return lintingEnabled();
    }
    getFormPreviewAutomatic(): boolean {
        return readSetting("formPreviewAutomatic");
    }

    getConfigFolder(): string {
        return readSetting("configFolder");
    }

    getC8ApiVersion(): string {
        return readSetting("c8ApiVersion");
    }

    getColorTheme(): ColorThemeSetting {
        return readSetting("colorTheme");
    }

    getDefaultMode(): SurfaceMode {
        return readSetting("defaultMode");
    }

    getFavouriteBpmnElements(): string[] {
        return readSetting("favouriteBpmnElements");
    }

    getLanguage(): string {
        return readSetting("language");
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
        return readSetting("persistCodeLinkMap");
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
        return readSetting("scriptingSpin");
    }

    /**
     * The union of the User- and Workspace-level marketplace lists, as the
     * core's `registeredMarketplaces` merges them. Forwards the raw entries
     * (URL/path strings, or object entries for self-hosted GHE / GitLab); the
     * domain parser validates each shape.
     *
     * `get()` returns only the effective scope — for an array VS Code shadow-
     * *replaces* rather than merges across scopes, so a workspace list would hide
     * the User list entirely. `inspect()` exposes both scopes so we can union them,
     * letting User-level entries act as "all my projects" while the workspace adds
     * project-specific ones.
     */
    getMarketplaces(): MarketplaceSettingsEntry[] {
        return registeredMarketplaces(this.getMarketplacesByScope()).map(({ entry }) => entry);
    }

    /** User settings hold "all my projects", Workspace settings "this project". */
    getMarketplacesByScope(): RegistrationsByScope {
        const { userEntries, workspaceEntries } = marketplacesByScope(modelerConfiguration());
        return { allProjects: userEntries, project: workspaceEntries };
    }

    /**
     * Unregisters the given marketplaces from every scope they appear in. Each
     * scope's own list from `inspect()` is filtered independently, and written
     * back only when it actually changed — an emptied list is written as
     * `undefined` so the `marketplaces` key is removed from that `settings.json`
     * rather than left as a stray `[]`.
     *
     * No-workspace safety is implicit: with no folder open the Workspace scope
     * holds no entries, so its update is never attempted and VS Code never throws.
     */
    async removeMarketplaces(entries: readonly MarketplaceSettingsEntry[]): Promise<void> {
        const config = modelerConfiguration();
        const { userEntries, workspaceEntries } = marketplacesByScope(config);

        await this.removeFromScope(config, userEntries, entries, ConfigurationTarget.Global);
        await this.removeFromScope(config, workspaceEntries, entries, ConfigurationTarget.Workspace);
    }

    /**
     * Filters one scope's own list and writes it back only if it shrank, so a
     * scope that never held any of the removed entries is left untouched (no
     * redundant `update` that would dirty its `settings.json`). An emptied list
     * is written as `undefined` to drop the key entirely.
     */
    private async removeFromScope(
        config: ModelerConfiguration,
        current: MarketplaceSettingsEntry[],
        removed: readonly MarketplaceSettingsEntry[],
        target: ConfigurationTarget,
    ): Promise<void> {
        const filtered = withoutMarketplaceEntries(current, removed);
        if (filtered.length === current.length) {
            return;
        }
        await config.update("marketplaces", filtered.length > 0 ? filtered : undefined, target);
    }

    /**
     * Where `ConfigurationTarget.Workspace` writes: the `.code-workspace` file a
     * window opened, else the folder's `.vscode/settings.json`. A workspace not
     * saved yet keeps its settings where only the Settings editor reaches them.
     */
    workspaceSettingsPlace(): SettingsPlace | undefined {
        const { workspaceFile } = workspace;
        if (workspaceFile?.scheme === "untitled") {
            return { kind: "settingsPage", path: ["Settings", "Workspace"] };
        }
        if (workspaceFile) {
            return { kind: "file", path: [posix.basename(workspaceFile.path)] };
        }
        return hasWorkspace() ? { kind: "file", path: [".vscode", "settings.json"] } : undefined;
    }

    /**
     * Appends the URL to the chosen scope's own list from `inspect()`, never the
     * union, so a Workspace write cannot copy User entries into the repository's
     * settings. Whether the add registers anything is the core's decision. A
     * `"project"` add with no folder or workspace open goes to the User settings,
     * because `update()` to Workspace throws without one.
     *
     * String `includes` de-dups only against other strings, which is all the Add
     * command writes; a string that resolves to the same repo as an object entry
     * slips through, costing only a redundant fetch into the same cache slot.
     */
    async addMarketplace(url: string, scope: MarketplaceScope): Promise<void> {
        const config = modelerConfiguration();
        const { userEntries, workspaceEntries } = marketplacesByScope(config);
        const [target, current] =
            scope === "allProjects" || !hasWorkspace()
                ? [ConfigurationTarget.Global, userEntries]
                : [ConfigurationTarget.Workspace, workspaceEntries];
        if (current.includes(url)) {
            return;
        }
        await config.update("marketplaces", [...current, url], target);
    }
}

function hasWorkspace(): boolean {
    return workspace.workspaceFolders !== undefined || workspace.workspaceFile !== undefined;
}

/** Each scope's own list, read as the core reads `marketplaces`. */
function marketplacesByScope(config: ModelerConfiguration): {
    userEntries: MarketplaceSettingsEntry[];
    workspaceEntries: MarketplaceSettingsEntry[];
} {
    const inspected = config.inspect("marketplaces");
    return {
        userEntries: parseSetting("marketplaces", inspected?.globalValue),
        workspaceEntries: parseSetting("marketplaces", inspected?.workspaceValue),
    };
}

function readSetting<K extends keyof ModelerSettingsSnapshot>(key: K): ModelerSettingsSnapshot[K] {
    return parseSetting(key, modelerConfiguration().get(settingKeyOf(key)));
}
