import { Command } from "@miragon/bpmn-modeler-shared";

import { MessageHandler } from "../../../shared/infrastructure/WebviewMessageRouter";
import { DmnSettingsBroadcaster } from "../service/DmnSettingsBroadcaster";

/** `GetDmnModelerSettingCommand` → broadcast the current color theme and language. */
export function getDmnModelerSettingHandler(
    settingsBroadcaster: DmnSettingsBroadcaster,
): MessageHandler {
    // Preserve the settings-then-language post order (settingsPromise starts
    // first), but await settings so its rejection reaches the router's dispatch
    // catch. setLanguage owns its own error handling and stays floating.
    return async (_message: Command, editorId: string) => {
        const settingsPromise = settingsBroadcaster.setSettings(editorId);
        settingsBroadcaster.setLanguage(editorId);
        await settingsPromise;
    };
}
