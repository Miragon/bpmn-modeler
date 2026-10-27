import { NotifierPort, PickerPort } from "../../kernel/domain/hostPorts";
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
    ) {}

    async navigate(
        reference: string,
        kind: ImplementationKind,
        sourceDocumentPath?: string,
    ): Promise<void> {
        const label = ImplementationTarget.of(kind, reference).label;
        await openLocatedFile(
            {
                reference,
                locate: () => this.locator.resolve(reference, kind, sourceDocumentPath),
                searchSubject: label,
                pickPlaceholder: "Select the referenced model to open",
                noSearchScopeMessage: (displayReference) =>
                    `No implementation for "${displayReference}" was found. Open a folder to enable code navigation.`,
                notFoundMessage: (displayReference) =>
                    `No implementation for ${label} "${displayReference}" was found in the workspace.`,
            },
            { notifier: this.notifier, picker: this.picker },
        );
    }
}
