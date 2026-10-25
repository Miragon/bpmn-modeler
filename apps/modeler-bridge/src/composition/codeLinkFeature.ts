import {
    CodeLinkMapService,
    CodeLinkParticipant,
    EditorSessionParticipant,
    ImplementationLocator,
    ImplementationNavigationService,
    navigateToImplementationHandler,
    SourceIndex,
    syncActivitiesHandler,
} from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The code-link feature owns the shared {@link ImplementationLocator} and both
 * consumers built on it: the on-click {@link ImplementationNavigationService}
 * and the always-on {@link CodeLinkMapService} (which maintains context-pad
 * visibility + live linking off the source-file watcher). Its participant
 * releases per-editor map/watcher state on dispose. This *is* the bridge's code-link feature, mirroring the VS Code
 * `composition/codeLinkFeature.ts`.
 *
 * Webview messages: NavigateToImplementationCommand, SyncActivitiesCommand.
 */
export function register(deps: BridgeSharedDeps): { participants: EditorSessionParticipant[] } {
    // The code-link brain is `vscode`-free too: the locator/navigation service
    // mirror the model-navigation pair (search via NodeWorkspace, surface via the
    // RPC notifier/picker), while the always-on map service maintains context-pad
    // visibility and live linking off the source-file watcher. The locator is
    // shared by both consumers.
    const implementationLocator = new ImplementationLocator(deps.nodeWorkspace, deps.notifier);
    const implementationNavigationService = new ImplementationNavigationService(
        implementationLocator,
        deps.notifier,
        deps.picker,
    );
    const codeLinkMapService = new CodeLinkMapService(
        deps.store,
        implementationLocator,
        new SourceIndex(deps.nodeWorkspace, deps.notifier),
        deps.artifactSvc,
        deps.nodeWorkspace,
        deps.settings,
        deps.notifier,
    );

    deps.router
        .on(
            "NavigateToImplementationCommand",
            navigateToImplementationHandler(
                deps.store,
                implementationNavigationService,
                deps.notifier,
            ),
        )
        .on("SyncActivitiesCommand", syncActivitiesHandler(codeLinkMapService));

    return { participants: [new CodeLinkParticipant(codeLinkMapService)] };
}
