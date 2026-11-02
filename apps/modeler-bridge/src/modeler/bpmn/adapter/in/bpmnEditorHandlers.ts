import { LintingPreferencePort, SettingsPort } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../../protocol/domain/rpcHandler";
import { SettingsDidChangeParams } from "../../../../protocol/domain/types";
import { HostSettingsMirror } from "../../../../kernel/port/HostSettingsMirror";

/** RPC (Host → Core): settings/didChange, linting/toggle (the status widget's click). */
export function bpmnEditorHandlers({
    settingsMirror,
    settings,
    lintingPreference,
    onSettingsApplied,
}: {
    settingsMirror: HostSettingsMirror;
    settings: SettingsPort;
    lintingPreference: LintingPreferencePort;
    onSettingsApplied: () => void;
}): RpcHandlerTable {
    return {
        // One host frame updates every open editor: `apply` fires a SettingChange that
        // each session's broadcaster + configFolder listener turn into webview pushes.
        // Diff panes aren't editor sessions, so they need an explicit locale re-push,
        // delivered via the diff feature's `rebroadcastLanguage` callback.
        [METHODS.settingsDidChange]: (params: SettingsDidChangeParams) => {
            settingsMirror.apply(params.settings);
            onSettingsApplied();
        },
        [METHODS.lintingToggle]: () =>
            lintingPreference.setLintingEnabled(!settings.getLintingEnabled()),
    };
}
