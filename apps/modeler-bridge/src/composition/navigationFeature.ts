import {
    EditorSessionParticipant,
    FormReferenceStatusParticipant,
    FormReferenceStatusService,
    getFormReferenceStatusHandler,
    ModelNavigationService,
    navigateToReferencedModelHandler,
    ReferencedModelLocator,
} from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The navigation feature owns referenced-model resolution: the
 * {@link ReferencedModelLocator} and {@link ModelNavigationService}, plus the
 * webview-message handler that opens a called process, decision, or linked form.
 *
 * Webview messages: NavigateToReferencedModelCommand, GetFormReferenceStatusCommand.
 */
export function register(deps: BridgeSharedDeps): { participants: EditorSessionParticipant[] } {
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

    deps.router
        .on(
            "NavigateToReferencedModelCommand",
            navigateToReferencedModelHandler(deps.store, modelNavigationService, deps.notifier),
        )
        .on(
            "GetFormReferenceStatusCommand",
            getFormReferenceStatusHandler(formReferenceStatusService),
        );

    return { participants: [new FormReferenceStatusParticipant(formReferenceStatusService)] };
}
