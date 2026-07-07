import { NotifierPort, PickerPort } from "../../shared/domain/hostPorts";

import { ReferencedModelLocator } from "./ReferencedModelLocator";

// Maximum length of a reference id echoed back into a user-facing notification.
const REFERENCE_ID_DISPLAY_LIMIT = 100;

// Tighter cap for the busy-list placeholder — it's space-constrained.
const PROGRESS_LABEL_LIMIT = 40;

/**
 * Resolves a process or decision id to a workspace file and opens it in its
 * registered custom editor.  Triggered by
 * `NavigateToReferencedModelCommand` from the BPMN webview.
 *
 * This service is a thin orchestrator: it delegates the search to
 * {@link ReferencedModelLocator} and maps the structured result to user-facing
 * notifications, a QuickPick (for multi-match), and `vscode.open`.
 */
export class ModelNavigationService {
    constructor(
        private readonly locator: ReferencedModelLocator,
        private readonly notifier: NotifierPort,
        private readonly picker: PickerPort,
    ) {}

    async navigate(
        referenceId: string,
        kind: "process" | "decision",
        sourceDocumentPath?: string,
    ): Promise<void> {
        const display = truncate(referenceId, REFERENCE_ID_DISPLAY_LIMIT);
        // The picker shows the search spinner on the list itself; this service
        // still owns the 0/1/error messaging. `picked` is set only on a
        // multi-match pick.
        const { outcome: result, chosen: picked } = await this.picker.searchAndPickReferencedModel(
            `Searching for ${kind} "${truncate(referenceId, PROGRESS_LABEL_LIMIT)}"…`,
            () => this.locator.findDeclaringFiles(referenceId, kind, sourceDocumentPath),
        );

        if (result.kind === "no-search-scope") {
            this.notifier.showInfo(
                `No model declaring "${display}" was found. Open a folder to enable cross-file navigation.`,
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
                `No model declaring "${display}" was found in the workspace. ` +
                    `(See Output → bpmn.modeler for what was searched.)`,
            );
            return;
        } else if (result.paths.length === 1) {
            chosen = result.paths[0];
        } else {
            chosen = picked;
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
