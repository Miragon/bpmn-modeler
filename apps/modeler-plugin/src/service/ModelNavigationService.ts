import { commands, ProgressLocation, Uri, window } from "vscode";

import { VsCodeUI } from "../infrastructure/VsCodeUI";

import { ReferencedModelLocator } from "./modelNavigation/ReferencedModelLocator";

/** Maximum length of a reference id echoed back into a user-facing notification. */
const REFERENCE_ID_DISPLAY_LIMIT = 100;

/** Tighter cap for the status-bar progress label — it's space-constrained. */
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
        private readonly vsUI: VsCodeUI,
    ) {}

    async navigate(
        referenceId: string,
        kind: "process" | "decision",
        sourceDocumentUri?: Uri,
    ): Promise<void> {
        const display = truncate(referenceId, REFERENCE_ID_DISPLAY_LIMIT);
        // Only the search itself is wrapped — the QuickPick (multi-match) and
        // vscode.open are user-driven and must not keep a spinner visible.
        const result = await window.withProgress(
            {
                location: ProgressLocation.Window,
                title: `Searching for ${kind} "${truncate(
                    referenceId,
                    PROGRESS_LABEL_LIMIT,
                )}"…`,
            },
            () => this.locator.findDeclaringFiles(referenceId, kind, sourceDocumentUri),
        );

        if (result.kind === "no-search-scope") {
            this.vsUI.showInfo(
                `No model declaring "${display}" was found. Open a folder to enable cross-file navigation.`,
            );
            return;
        }

        if (result.kind === "all-unreadable") {
            result.failures.forEach((message) => this.vsUI.logWarning(message));
            this.vsUI.showError(
                `Could not search for "${display}" — none of the candidate files were readable.`,
            );
            return;
        }

        result.readFailures.forEach((message) => this.vsUI.logWarning(message));

        let chosen: string | undefined;
        if (result.paths.length === 0) {
            this.vsUI.showInfo(
                `No model declaring "${display}" was found in the workspace. ` +
                    `(See Output → bpmn.modeler for what was searched.)`,
            );
            return;
        } else if (result.paths.length === 1) {
            chosen = result.paths[0];
        } else {
            chosen = await this.vsUI.pickReferencedModel(result.paths);
        }

        if (!chosen) {
            return;
        }

        try {
            await commands.executeCommand("vscode.open", Uri.file(chosen));
        } catch (error) {
            this.vsUI.logError(error as Error);
            this.vsUI.showError(`Could not open ${chosen}: ${(error as Error).message}`);
        }
    }
}

function truncate(value: string, max: number): string {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
