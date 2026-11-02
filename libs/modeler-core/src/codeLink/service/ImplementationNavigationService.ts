import { NotifierPort, PickerPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import { openLocatedFile } from "../../kernel/service/openLocatedFile";
import { ImplementationKind } from "../domain/ImplementationReference";
import { ImplementationTarget } from "../domain/ImplementationTarget";

import { ImplementationLocator } from "./ImplementationLocator";

/**
 * Resolves a Camunda implementation reference to a workspace source file and
 * opens it. Triggered by `NavigateToImplementationCommand` from the BPMN
 * webview.
 *
 * A thin orchestrator: it delegates the search to {@link ImplementationLocator}
 * and the 0/1/N flow to {@link openLocatedFile}, and owns only its wording.
 */
export class ImplementationNavigationService {
    constructor(
        private readonly locator: ImplementationLocator,
        private readonly notifier: NotifierPort,
        private readonly picker: PickerPort,
        private readonly workspace: WorkspacePort,
    ) {}

    async navigate(
        reference: string,
        kind: ImplementationKind,
        sourceDocumentPath?: string,
    ): Promise<void> {
        const label = ImplementationTarget.of(kind, reference).label;
        const nothingImplements = (displayReference: string) =>
            `No implementation for ${label} "${displayReference}" was found`;
        await openLocatedFile(
            {
                reference,
                locate: () => this.locator.resolve(reference, kind, sourceDocumentPath),
                searchSubject: label,
                pickPlaceholder: "Select the implementation to open",
                noSearchScopeMessage: (displayReference) =>
                    `${nothingImplements(displayReference)}. Open a folder to enable code navigation.`,
                notFoundMessage: (displayReference) =>
                    `${nothingImplements(displayReference)} in the workspace.`,
            },
            { notifier: this.notifier, picker: this.picker, workspace: this.workspace },
        );
    }
}
