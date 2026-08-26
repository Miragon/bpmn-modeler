import {
    Command,
    NavigateToImplementationCommand,
    SyncActivitiesCommand,
} from "@miragon/bpmn-modeler-shared";
import { ImplementationKind } from "@miragon/bpmn-modeler-types";
import {
    CodeLinkMapService,
    ImplementationLocator,
    ImplementationNavigationService,
} from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";
import { SessionHooks } from "./sessionHooks";

/** Implementation kinds the locator can resolve; a guard against a malformed webview message. */
const KNOWN_IMPLEMENTATION_KINDS: ReadonlySet<ImplementationKind> = new Set<ImplementationKind>([
    "javaClass",
    "delegateExpression",
    "expression",
    "externalTopic",
    "jobType",
]);

/**
 * The code-link feature owns the shared {@link ImplementationLocator} and both
 * consumers built on it: the on-click {@link ImplementationNavigationService}
 * and the always-on {@link CodeLinkMapService} (which maintains context-pad
 * visibility + live linking off the source-file watcher). It returns a session
 * hook so the editor-session feature releases per-editor map/watcher state on
 * dispose. This *is* the bridge's code-link feature, mirroring the VS Code
 * `composition/codeLinkFeature.ts`.
 *
 * Webview messages: NavigateToImplementationCommand, SyncActivitiesCommand.
 */
export function register(deps: BridgeSharedDeps): { sessionHooks: SessionHooks } {
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
        deps.artifactSvc,
        deps.nodeWorkspace,
        deps.settings,
        deps.notifier,
    );

    deps.router
        // Mirrors `navigateToImplementationHandler` on the VS Code host: the same
        // defence-in-depth guard rejects an unknown/empty `kind` so a malformed
        // message can't be resolved as an arbitrary kind.
        .on("NavigateToImplementationCommand", async (message: Command, editorId: string) => {
            const cmd = message as NavigateToImplementationCommand;
            if (!KNOWN_IMPLEMENTATION_KINDS.has(cmd.kind)) {
                deps.notifier.logWarning(
                    `Ignoring NavigateToImplementationCommand with unknown kind: ${String(
                        cmd.kind,
                    )}`,
                );
                return;
            }
            const sourceFsPath = deps.store.requireHandle(editorId).documentFsPath();
            await implementationNavigationService.navigate(cmd.reference, cmd.kind, sourceFsPath);
        })
        // Always-on activity→code reconciliation; the map service filters invalid
        // entries internally, so this stays a thin pass-through.
        .on("SyncActivitiesCommand", async (message: Command, editorId: string) => {
            await codeLinkMapService.syncActivities(
                editorId,
                (message as SyncActivitiesCommand).entries,
            );
        });

    return {
        sessionHooks: {
            // Release this editor's code-link map state + its share of the source
            // watcher; mirrors `CodeLinkParticipant` (the bridge has no participants).
            onSessionDisposed: (editorId) => codeLinkMapService.disposeEditor(editorId),
        },
    };
}
