import { ConfigurationChangeEvent, ConfigurationTarget, workspace } from "vscode";

import { SettingChange, SettingKey } from "@miragon/bpmn-modeler-core";

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

export function settingChangeOf(event: ConfigurationChangeEvent): SettingChange {
    return {
        affects: (key) => event.affectsConfiguration(`${MODELER_SETTINGS_SECTION}.${key}`),
    };
}
