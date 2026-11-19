import {
    FormPreviewQuery,
    type GetFormPreviewCommand,
    type SearchWorkspaceDefinitionsCommand,
    WorkspaceDefinitionsQuery,
} from "@miragon/bpmn-modeler-shared";
import { matchesDefinitionQuery } from "@miragon/bpmn-modeler-types";

import { MOCK_WORKSPACE_DEFINITIONS } from "../../../__fixtures__/mock-workspace-definitions";

export function definitionsMatching({
    requestId,
    kind,
    text,
}: SearchWorkspaceDefinitionsCommand): WorkspaceDefinitionsQuery {
    const definitions = MOCK_WORKSPACE_DEFINITIONS.filter((definition) =>
        matchesDefinitionQuery(definition, { kind, text }),
    );
    return new WorkspaceDefinitionsQuery(requestId, definitions);
}

/** No workspace behind the preview to find a linked form in. */
export function unavailableFormPreview({ requestId }: GetFormPreviewCommand): FormPreviewQuery {
    return new FormPreviewQuery(requestId, { kind: "unavailable", reason: "noScope" });
}
