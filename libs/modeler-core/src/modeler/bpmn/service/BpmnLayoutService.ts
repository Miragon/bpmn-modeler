import {
    CleanupDiagramQuery,
    CleanupReportCommand,
    DiagramFormattedCommand,
    FormatDiagramQuery,
} from "@miragon/bpmn-modeler-shared";
import { LayoutErrorCode } from "@miragon/bpmn-modeler-types";

import { NotifierPort, PickerPort } from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";

/** What each refusal means, in words a user can act on. */
const REFUSAL_MESSAGES: Record<LayoutErrorCode, string> = {
    UNSUPPORTED_SURFACE: "This diagram is read-only, so it cannot be formatted.",
    EMPTY_DIAGRAM: "There is nothing to format yet.",
    ENGINE_FAILED: "The diagram could not be formatted.",
    DIAGRAM_CHANGED: "The diagram changed while it was being formatted. Try again.",
    APPLY_FAILED: "The new layout could not be applied, so the diagram is unchanged.",
};

const NOTHING_TO_CLEAN = "Nothing to clean up — the diagram carries no leftovers.";

/**
 * Drives formatting and cleanup from the host side.
 *
 * Lives in the core rather than in a host controller so the VS Code command and
 * the IntelliJ action are each a one-line trigger and neither host reimplements
 * the report-confirm-apply dance.
 */
export class BpmnLayoutService {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly notifier: NotifierPort,
        private readonly picker: PickerPort,
    ) {}

    /**
     * Asks the active editor to format. The outcome arrives asynchronously as a
     * {@link DiagramFormattedCommand}; see {@link reportFormatted}.
     */
    async format(editorId: string): Promise<void> {
        await this.editorStore.postMessage(editorId, new FormatDiagramQuery());
    }

    /** Handles the webview's reply to a format, from either trigger. */
    reportFormatted(message: DiagramFormattedCommand): void {
        // Warnings are common and rarely actionable — the log, not a toast.
        for (const diagnostic of message.diagnostics) {
            const where = diagnostic.elementId ? ` (${diagnostic.elementId})` : "";
            this.notifier.logInfo(`Format: ${diagnostic.message}${where}`);
        }

        if (message.status === "formatted") return;

        if (message.status === "unchanged") {
            this.notifier.showInfo("The diagram is already formatted.");
            return;
        }

        const reason = message.code
            ? REFUSAL_MESSAGES[message.code]
            : REFUSAL_MESSAGES.ENGINE_FAILED;
        if (message.message) this.notifier.logError(`Format failed: ${message.message}`);
        this.notifier.showError(
            message.code === "ENGINE_FAILED" && message.message
                ? `${reason} ${message.message}`
                : reason,
        );
    }

    /** Starts a cleanup by asking for a report; nothing is removed yet. */
    async inspectCleanup(editorId: string): Promise<void> {
        await this.editorStore.postMessage(editorId, new CleanupDiagramQuery(false));
    }

    /**
     * Handles a cleanup report: confirms with the user, then asks the webview
     * to apply — which recomputes rather than acting on `outcome.items`.
     */
    async reportCleanup(message: CleanupReportCommand, editorId: string): Promise<void> {
        const { status, items, message: detail } = message.outcome;

        if (status === "failed") {
            if (detail) this.notifier.logError(`Cleanup failed: ${detail}`);
            this.notifier.showError(
                message.applied
                    ? "The leftovers could not be removed, so the diagram is unchanged."
                    : "The diagram could not be checked for leftovers.",
            );
            return;
        }

        if (message.applied) {
            this.notifier.showInfo(
                items.length === 0 ? NOTHING_TO_CLEAN : `Cleaned up ${items.length} item(s).`,
            );
            return;
        }

        if (items.length === 0) {
            this.notifier.showInfo(NOTHING_TO_CLEAN);
            return;
        }

        const confirmed = await this.picker.confirmDestructive({
            title: `Remove ${items.length} leftover item(s) from this diagram?`,
            confirmLabel: "Clean Up",
            details: items.map((item) => item.label),
        });
        if (!confirmed) return;

        await this.editorStore.postMessage(editorId, new CleanupDiagramQuery(true));
    }
}
