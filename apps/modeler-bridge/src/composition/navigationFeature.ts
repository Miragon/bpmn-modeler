import { Command, NavigateToReferencedModelCommand } from "@miragon/bpmn-modeler-shared";
import {
    FormReferenceStatusService,
    ModelNavigationService,
    ReferencedModelLocator,
} from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";
import { SessionHooks } from "./sessionHooks";

/**
 * The navigation feature owns referenced-model resolution: the
 * {@link ReferencedModelLocator} and {@link ModelNavigationService}, plus the
 * webview-message handler that opens a called process, decision, or linked form.
 *
 * Webview messages: NavigateToReferencedModelCommand, GetFormReferenceStatusCommand.
 */
export function register(deps: BridgeSharedDeps): { sessionHooks: SessionHooks } {
    // The model-navigation brain is `vscode`-free, so it runs unmodified here:
    // the locator searches via NodeWorkspace's findFiles/readFile/readDirectory,
    // and the service surfaces results through the same notifier/picker the host
    // already implements over RPC (notifier/openDocument + picker/show).
    const referencedModelLocator = new ReferencedModelLocator(deps.nodeWorkspace, deps.notifier);
    const modelNavigationService = new ModelNavigationService(
        referencedModelLocator,
        deps.notifier,
        deps.picker,
    );
    const formReferenceStatusService = new FormReferenceStatusService(
        deps.store,
        deps.documentPort,
        deps.nodeWorkspace,
        referencedModelLocator,
        deps.notifier,
    );

    // Mirrors `navigateToReferencedModelHandler` on the VS Code host: an
    // unknown discriminant is rejected with a warning rather than falling
    // through to "decision" by default — defence in depth against a
    // malformed webview message ever opening the wrong kind of file.
    deps.router
        .on("NavigateToReferencedModelCommand", async (message: Command, editorId: string) => {
            const cmd = message as NavigateToReferencedModelCommand;
            if (
                cmd.referenceKind !== "process" &&
                cmd.referenceKind !== "decision" &&
                cmd.referenceKind !== "form"
            ) {
                deps.notifier.logWarning(
                    `Ignoring NavigateToReferencedModelCommand with unknown kind: ${String(
                        cmd.referenceKind,
                    )}`,
                );
                return;
            }
            const sourceFsPath = deps.store.requireHandle(editorId).documentFsPath();
            await modelNavigationService.navigate(cmd.referenceId, cmd.referenceKind, sourceFsPath);
        })
        .on("GetFormReferenceStatusCommand", async (_message: Command, editorId: string) => {
            await formReferenceStatusService.requestStatus(editorId);
        });

    return {
        sessionHooks: {
            onSessionDisposed: (editorId) => formReferenceStatusService.disposeEditor(editorId),
        },
    };
}
