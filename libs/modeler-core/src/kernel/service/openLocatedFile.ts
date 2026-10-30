import { NotifierPort, PickerPort, WorkspacePort } from "../domain/hostPorts";
import { classifyLocateResult, LocateResult } from "../domain/locateResult";
import { referenceForDisplay, truncateForDisplay } from "../domain/truncateForDisplay";

// Tighter cap for the busy-list placeholder — it's space-constrained.
const PROGRESS_LABEL_LIMIT = 40;

/**
 * One navigation's search and the words it uses. The message builders get the
 * reference already shortened for display.
 */
export interface LocatedFileRequest {
    reference: string;
    locate: () => Promise<LocateResult>;
    /** Names what is searched for in `Searching for <searchSubject> "<reference>"…`. */
    searchSubject: string;
    pickPlaceholder: string;
    /** The info shown when there is no folder to search. */
    noSearchScopeMessage(displayReference: string): string;
    /** The info shown when nothing matched, ahead of the pointer to the Output channel. */
    notFoundMessage(displayReference: string): string;
}

/**
 * Runs the request's search behind the picker and opens what it settles on: a
 * single match directly, one of several once the user picks it. Every other
 * outcome ends in a message, with read failures logged.
 */
export async function openLocatedFile(
    request: LocatedFileRequest,
    host: { notifier: NotifierPort; picker: PickerPort; workspace: WorkspacePort },
): Promise<void> {
    const { notifier, picker } = host;
    const displayReference = referenceForDisplay(request.reference);
    const progressReference = truncateForDisplay(request.reference, PROGRESS_LABEL_LIMIT);
    const { outcome, chosen } = await picker.searchAndPickLocatedFile(
        {
            searchingPlaceholder: `Searching for ${request.searchSubject} "${progressReference}"…`,
            pickPlaceholder: request.pickPlaceholder,
        },
        request.locate,
    );

    const located = classifyLocateResult(outcome);
    if (located.kind === "noScope") {
        notifier.showInfo(request.noSearchScopeMessage(displayReference));
        return;
    }
    if (located.kind === "unreadable") {
        located.failures.forEach((message) => notifier.logWarning(message));
        notifier.showError(
            `Could not search for "${displayReference}" — none of the candidate files were readable.`,
        );
        return;
    }

    located.readFailures.forEach((message) => notifier.logWarning(message));
    if (located.kind === "notFound") {
        notifier.showInfo(
            `${request.notFoundMessage(displayReference)} ` +
                `(See Output → bpmn.modeler for what was searched.)`,
        );
        return;
    }

    const path = located.kind === "single" ? located.path : chosen;
    if (!path) {
        return;
    }
    try {
        await notifier.openDocument(path);
    } catch (error) {
        notifier.logError(error as Error);
        notifier.showError(`Could not open ${path}: ${(error as Error).message}`);
    }
}
