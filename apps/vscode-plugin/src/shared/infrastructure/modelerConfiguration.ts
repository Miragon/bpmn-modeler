import { ConfigurationChangeEvent, ConfigurationTarget, Disposable, workspace } from "vscode";

import { parseLintingEnabled, SettingChange, SettingKey } from "@miragon/bpmn-modeler-core";

/** The section VS Code stores every modeler setting below. */
export const MODELER_SETTINGS_SECTION = "miragon.bpmnModeler";

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
    return parseLintingEnabled(modelerConfiguration().get("linting.enabled"));
}

export function setLintingEnabled(enabled: boolean): Thenable<void> {
    return updatePersonalPreference("linting.enabled", enabled);
}

export function setLanguage(locale: string): Thenable<void> {
    return updatePersonalPreference("language", locale);
}

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
