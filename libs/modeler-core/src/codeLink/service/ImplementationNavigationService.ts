import { NotifierPort, PickerPort } from "../../shared/domain/hostPorts";
import { ImplementationKind } from "../domain/ImplementationReference";

import { ImplementationLocator } from "./ImplementationLocator";

// Maximum length of a reference echoed back into a user-facing notification.
const REFERENCE_DISPLAY_LIMIT = 100;

// Tighter cap for the status-bar progress label — it's space-constrained.
const PROGRESS_LABEL_LIMIT = 40;

// Human-readable labels for the progress / not-found messages, per kind.
const KIND_LABELS: Record<ImplementationKind, string> = {
    javaClass: "class",
    delegateExpression: "delegate",
    expression: "expression",
    externalTopic: "external task topic",
    jobType: "job type",
};

/**
 * Resolves a Camunda implementation reference to a workspace source file and
 * opens it. Triggered by `NavigateToImplementationCommand` from the BPMN
 * webview.
 *
 * A thin orchestrator: it delegates the search to {@link ImplementationLocator}
 * and maps the structured result to user-facing notifications, a QuickPick (for
 * multi-match), and `vscode.open` — the exact 0/1/N flow of
 * `ModelNavigationService`.
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
        const label = KIND_LABELS[kind];
        const display = truncate(reference, REFERENCE_DISPLAY_LIMIT);
        // Only the search is wrapped — the QuickPick (multi-match) and
        // openDocument are user-driven and must not keep a spinner visible.
        const result = await this.notifier.withProgress(
            `Searching for ${label} "${truncate(reference, PROGRESS_LABEL_LIMIT)}"…`,
            () => this.locator.resolve(reference, kind, sourceDocumentPath),
        );

        if (result.kind === "no-search-scope") {
            this.notifier.showInfo(
                `No implementation for "${display}" was found. Open a folder to enable code navigation.`,
            );
            return;
        }

        if (result.kind === "all-unreadable") {
            result.failures.forEach((message) => this.notifier.logWarning(message));
            this.notifier.showError(
                `Could not search for "${display}" — none of the candidate files were readable.`,
            );
            return;
        }

        result.readFailures.forEach((message) => this.notifier.logWarning(message));

        let chosen: string | undefined;
        if (result.paths.length === 0) {
            this.notifier.showInfo(
                `No implementation for ${label} "${display}" was found in the workspace. ` +
                    `(See Output → bpmn.modeler for what was searched.)`,
            );
            return;
        } else if (result.paths.length === 1) {
            chosen = result.paths[0];
        } else {
            chosen = await this.picker.pickReferencedModel(result.paths);
        }

        if (!chosen) {
            return;
        }

        try {
            await this.notifier.openDocument(chosen);
        } catch (error) {
            this.notifier.logError(error as Error);
            this.notifier.showError(`Could not open ${chosen}: ${(error as Error).message}`);
        }
    }
}

function truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
