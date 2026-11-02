import { NotifierPort, PickerPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import { openLocatedFile } from "../../kernel/service/openLocatedFile";
import type { ReferenceKind } from "@miragon/bpmn-modeler-types";

import { ReferencedModelLocator } from "./ReferencedModelLocator";

/**
 * Resolves a process, decision, or form id to a workspace file and opens it in its
 * registered custom editor.  Triggered by
 * `NavigateToReferencedModelCommand` from the BPMN webview.
 *
 * This service is a thin orchestrator: it delegates the search to
 * {@link ReferencedModelLocator} and the 0/1/N flow to {@link openLocatedFile},
 * and owns only its wording.
 */
export class ModelNavigationService {
    constructor(
        private readonly locator: ReferencedModelLocator,
        private readonly notifier: NotifierPort,
        private readonly picker: PickerPort,
        private readonly workspace: WorkspacePort,
    ) {}

    async navigate(
        referenceId: string,
        kind: ReferenceKind,
        sourceDocumentPath?: string,
    ): Promise<void> {
        await openLocatedFile(
            {
                reference: referenceId,
                locate: () =>
                    this.locator.findDeclaringFiles(referenceId, kind, sourceDocumentPath),
                searchSubject: kind,
                pickPlaceholder: "Select the referenced model to open",
                noSearchScopeMessage: (displayId) =>
                    `No model declaring "${displayId}" was found. Open a folder to enable cross-file navigation.`,
                notFoundMessage: (displayId) =>
                    `No model declaring "${displayId}" was found in the workspace.`,
            },
            { notifier: this.notifier, picker: this.picker, workspace: this.workspace },
        );
    }
}
