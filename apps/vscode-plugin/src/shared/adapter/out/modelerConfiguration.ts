import { ConfigurationChangeEvent, ConfigurationTarget, Disposable, workspace } from "vscode";

import { parseSetting, SettingChange, SettingKey } from "@miragon/bpmn-modeler-core";
import { MODELER_SETTINGS_SECTION } from "../../domain/modelerSettingsSection";
import { ModelerPreferences } from "../../port/ModelerPreferences";

/** VS Code's configuration of the modeler, asked only by the keys the manifest declares. */
export interface ModelerConfiguration {
    get(key: SettingKey): unknown;
    inspect(key: SettingKey): { globalValue?: unknown; workspaceValue?: unknown } | undefined;
    update(key: SettingKey, value: unknown, target: ConfigurationTarget): Thenable<void>;
}

export function modelerConfiguration(): ModelerConfiguration {
    return workspace.getConfiguration(MODELER_SETTINGS_SECTION);
}

export function onDidChangeModelerSetting(listener: (change: SettingChange) => void): Disposable {
    return workspace.onDidChangeConfiguration((event) => listener(settingChangeOf(event)));
}

export function lintingEnabled(): boolean {
    return parseSetting("lintingEnabled", modelerConfiguration().get("linting.enabled"));
}

export function setLintingEnabled(enabled: boolean): Thenable<void> {
    return updatePersonalPreference("linting.enabled", enabled);
}

export function setLanguage(locale: string): Thenable<void> {
    return updatePersonalPreference("language", locale);
}

export const vsCodeModelerPreferences: ModelerPreferences = {
    lintingEnabled,
    setLintingEnabled,
    setLanguage,
    onDidChangeSetting: onDidChangeModelerSetting,
};

/**
 * User scope: one switch covers every project, and no collaborator's choice is
 * pinned to a shared workspace settings file.
 */
function updatePersonalPreference(key: SettingKey, value: unknown): Thenable<void> {
    return modelerConfiguration().update(key, value, ConfigurationTarget.Global);
}

function settingChangeOf(event: ConfigurationChangeEvent): SettingChange {
    return {
        affects: (key) => event.affectsConfiguration(`${MODELER_SETTINGS_SECTION}.${key}`),
    };
}
