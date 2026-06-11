import { ExtensionContext } from "vscode";

import {
    CodeLinkMapService,
    ImplementationLocator,
    ImplementationNavigationService,
} from "@miragon/bpmn-modeler-core";
import { CodeLinkParticipant } from "../codeLink/controller/editor-participants/CodeLinkParticipant";
import { SharedDeps } from "./sharedDeps";

/**
 * Collaborators the code-link feature contributes to the BPMN editor: the
 * navigation service that handles a "Go to implementation" click, the always-on
 * map service that maintains context-pad visibility + live linking, and the
 * participant that releases per-editor map/watcher state on close.
 */
export interface CodeLinkHandles {
    implementationNavigation: ImplementationNavigationService;
    codeLinkMap: CodeLinkMapService;
    codeLinkParticipant: CodeLinkParticipant;
}

/**
 * The code-link feature owns the shared {@link ImplementationLocator} and builds
 * both consumers on top of it: the on-click navigation service and the
 * always-on {@link CodeLinkMapService} (which also owns the shared source-file
 * watcher). They are returned as handles for the editor feature to route the
 * `NavigateToImplementationCommand` / `SyncActivitiesCommand` messages and the
 * teardown participant into — only the BPMN router consumes them.
 *
 * Constructed here rather than in `editorFeature` so the locator is shared by
 * both consumers and the watcher's lifetime is owned in one place. As a
 * `composition/` module it may import code-link internals directly; the
 * feature-isolation rule applies only between feature folders.
 */
export function register(context: ExtensionContext, deps: SharedDeps): CodeLinkHandles {
    const locator = new ImplementationLocator(deps.vsWorkspace, deps.notifier);
    const implementationNavigation = new ImplementationNavigationService(
        locator,
        deps.notifier,
        deps.picker,
    );
    const codeLinkMap = new CodeLinkMapService(
        deps.editorStore,
        locator,
        deps.artifactSvc,
        deps.vsWorkspace,
        deps.vsSettings,
        deps.notifier,
    );
    // Dispose the shared source-file watcher(s) on extension shutdown.
    context.subscriptions.push({ dispose: () => codeLinkMap.dispose() });

    return {
        implementationNavigation,
        codeLinkMap,
        codeLinkParticipant: new CodeLinkParticipant(codeLinkMap),
    };
}
