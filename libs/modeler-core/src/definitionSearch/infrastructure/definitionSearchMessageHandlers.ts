import { SearchWorkspaceDefinitionsCommand } from "@miragon/bpmn-modeler-shared";

import { MessageHandler } from "../../editorSession/service/WebviewMessageRouter";
import { DefinitionSearchService } from "../service/DefinitionSearchService";

/** `SearchWorkspaceDefinitionsCommand` → answer with matching definitions of other models. */
export function searchWorkspaceDefinitionsHandler(
    searchService: DefinitionSearchService,
): MessageHandler<SearchWorkspaceDefinitionsCommand> {
    return async (message, editorId) => {
        await searchService.search(editorId, message);
    };
}
