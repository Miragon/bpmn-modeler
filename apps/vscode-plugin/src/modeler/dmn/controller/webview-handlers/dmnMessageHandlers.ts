import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import { MessageHandler } from "@miragon/bpmn-modeler-core";
import { DmnModelerService } from "@miragon/bpmn-modeler-core";
import { DmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";

/**
 * Factories that translate DMN webview commands into {@link DmnModelerService}
 * calls. Kept separate from the BPMN handlers because both protocols carry
 * `SyncDocumentCommand` but route it to a different service.
 */

/** `GetDmnFileCommand` → render the diagram, logging readiness on success. */
export function getDmnFileHandler(
    dmnService: DmnModelerService,
    notifier: VsCodeNotifier,
): MessageHandler {
    return async (_message: Command, editorId: string) => {
        if (await dmnService.display(editorId)) {
            notifier.logDebug("Dmn modeler is ready");
        }
    };
}

/** `SyncDocumentCommand` → persist the current DMN XML. */
export function syncDmnDocumentHandler(dmnService: DmnModelerService): MessageHandler {
    return async (message: Command, editorId: string) => {
        const sync = message as SyncDocumentCommand;
        await dmnService.sync(editorId, sync.content, sync.documentRevision);
    };
}

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
