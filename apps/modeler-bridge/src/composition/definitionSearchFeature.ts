import {
    DefinitionSearchParticipant,
    DefinitionSearchService,
    EditorSessionParticipant,
    searchWorkspaceDefinitionsHandler,
    WorkspaceDefinitionIndex,
} from "@miragon/bpmn-modeler-core";

import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The definition-search feature owns the {@link WorkspaceDefinitionIndex} and
 * the {@link DefinitionSearchService} that answer the webview's search for
 * messages, signals, errors and escalations of other models.
 *
 * Webview messages: SearchWorkspaceDefinitionsCommand.
 */
export function register(deps: BridgeSharedDeps): { participants: EditorSessionParticipant[] } {
    const definitionSearchService = new DefinitionSearchService(
        deps.store,
        deps.documentPort,
        deps.nodeWorkspace,
        new WorkspaceDefinitionIndex(deps.nodeWorkspace, deps.notifier),
        deps.notifier,
    );

    deps.router.on(
        "SearchWorkspaceDefinitionsCommand",
        searchWorkspaceDefinitionsHandler(definitionSearchService),
    );

    return { participants: [new DefinitionSearchParticipant(definitionSearchService)] };
}
