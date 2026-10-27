import { Command, NavigateToReferencedModelCommand } from "@miragon/bpmn-modeler-shared";
import { FormPreviewQuery, type GetFormPreviewCommand } from "@miragon/bpmn-modeler-shared";
import { FormPreviewService } from "../service/FormPreviewService";

import { NotifierPort } from "../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";
import { MessageHandler } from "../../shared/infrastructure/WebviewMessageRouter";
import { FormReferenceStatusService } from "../service/FormReferenceStatusService";
import { ModelNavigationService } from "../service/ModelNavigationService";

/**
 * `NavigateToReferencedModelCommand` → jump to the referenced process/decision.
 *
 * Defence-in-depth: an unknown discriminant is rejected with a warning rather
 * than falling through, so a malformed/hostile message can't be treated as a
 * decision navigation by default.
 */
export function navigateToReferencedModelHandler(
    editorStore: EditorSessionStore,
    modelNavigationService: ModelNavigationService,
    notifier: NotifierPort,
): MessageHandler<NavigateToReferencedModelCommand> {
    return async (cmd, editorId) => {
        if (
            cmd.referenceKind !== "process" &&
            cmd.referenceKind !== "decision" &&
            cmd.referenceKind !== "form"
        ) {
            notifier.logWarning(
                `Ignoring NavigateToReferencedModelCommand with unknown kind: ${String(
                    cmd.referenceKind,
                )}`,
            );
            return;
        }
        const sourceFsPath = editorStore.requireHandle(editorId).documentFsPath();
        await modelNavigationService.navigate(cmd.referenceId, cmd.referenceKind, sourceFsPath);
    };
}

/** `GetFormReferenceStatusCommand` → push resolvable form ids to the BPMN webview. */
export function getFormReferenceStatusHandler(
    statusService: FormReferenceStatusService,
): MessageHandler {
    return async (_message: Command, editorId: string) => {
        await statusService.requestStatus(editorId);
    };
}

export function getFormPreviewHandler(
    store: EditorSessionStore,
    service: FormPreviewService,
): MessageHandler<GetFormPreviewCommand> {
    return async (command, editorId) => {
        const handle = store.requireHandle(editorId);
        const result =
            typeof command.formId === "string" && command.formId.length > 0
                ? await service.read(command.formId, handle.documentFsPath())
                : {
                      kind: "unavailable" as const,
                      message: "This task has no local form reference.",
                  };
        // A hidden/replaced editor must not receive a result from the old session.
        if (store.hasEditor(editorId) && store.requireHandle(editorId) === handle) {
            await handle.postMessage(new FormPreviewQuery(command.requestId, result));
        }
    };
}
