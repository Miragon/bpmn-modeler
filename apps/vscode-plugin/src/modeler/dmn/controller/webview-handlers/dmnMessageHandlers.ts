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
        await dmnService.sync(editorId, (message as SyncDocumentCommand).content);
    };
}

/** `GetDmnModelerSettingCommand` → broadcast the current color theme to the webview. */
export function getDmnModelerSettingHandler(
    settingsBroadcaster: DmnSettingsBroadcaster,
): MessageHandler {
    // Await so a rejection propagates to the router's dispatch catch instead of
    // floating off unlogged.
    return async (_message: Command, editorId: string) => {
        await settingsBroadcaster.setSettings(editorId);
    };
}
