import {
    NavigateToImplementationCommand,
    SyncActivitiesCommand,
} from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";
import { MessageHandler } from "../../shared/infrastructure/WebviewMessageRouter";
import { CodeLinkMapService } from "../service/CodeLinkMapService";
import { ImplementationNavigationService } from "../service/ImplementationNavigationService";

// The implementation kinds the host knows how to resolve. Used as a runtime
// guard so a malformed/hostile message can't reach the locator with a bogus kind.
const KNOWN_IMPLEMENTATION_KINDS = new Set([
    "javaClass",
    "delegateExpression",
    "expression",
    "externalTopic",
    "jobType",
]);

/**
 * `NavigateToImplementationCommand` → jump to the task's source implementation.
 *
 * Defence-in-depth: an unknown/empty `kind` is rejected with a warning rather
 * than falling through, so a malformed message can't be resolved as an
 * arbitrary kind by default.
 */
export function navigateToImplementationHandler(
    editorStore: EditorSessionStore,
    implementationNavigationService: ImplementationNavigationService,
    notifier: NotifierPort,
): MessageHandler<NavigateToImplementationCommand> {
    return async (cmd, editorId) => {
        if (!KNOWN_IMPLEMENTATION_KINDS.has(cmd.kind)) {
            notifier.logWarning(
                `Ignoring NavigateToImplementationCommand with unknown kind: ${String(cmd.kind)}`,
            );
            return;
        }
        const sourceFsPath = editorStore.requireHandle(editorId).documentFsPath();
        await implementationNavigationService.navigate(cmd.reference, cmd.kind, sourceFsPath);
    };
}

/**
 * `SyncActivitiesCommand` → reconcile the editor's activity→code map.
 *
 * The map service diffs the pushed references against what it holds, does
 * filesystem work only for the delta, and pushes resolution status back to the
 * webview for context-pad visibility. Invalid entries are filtered inside the
 * service, so the handler stays a thin pass-through.
 */
export function syncActivitiesHandler(
    mapService: CodeLinkMapService,
): MessageHandler<SyncActivitiesCommand> {
    return async (message, editorId) => {
        await mapService.syncActivities(editorId, message.entries);
    };
}
