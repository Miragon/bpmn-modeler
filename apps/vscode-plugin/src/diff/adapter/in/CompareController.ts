import { commands, ExtensionContext, Uri, window } from "vscode";

import {
    COMPARE_WITH_ITSELF_TEXT,
    CompareFormat,
    NotifierPort,
    nothingSelectedForCompareText,
    selectedForCompareText,
    selectTwoFilesText,
} from "@miragon/bpmn-modeler-core";
import { CompareSelectionStore } from "./CompareSelectionStore";
import { DiffController } from "./DiffController";

/** One file format's three compare commands. */
export interface CompareCommands extends CompareFormat {
    /** First step of a two-file compare: remembers the file. */
    readonly selectForCompare: string;
    /** Second step: compares the given file with the remembered one. */
    readonly compareWithSelected: string;
    /** Single step, for an Explorer multi-selection of exactly two files. */
    readonly compareSelected: string;
}

export const BPMN_COMPARE: CompareCommands = {
    extension: ".bpmn",
    label: "BPMN",
    selectForCompare: "bpmn-modeler.selectForCompare",
    compareWithSelected: "bpmn-modeler.compareWithSelected",
    compareSelected: "bpmn-modeler.compareSelected",
};

export const DMN_COMPARE: CompareCommands = {
    extension: ".dmn",
    label: "DMN",
    selectForCompare: "bpmn-modeler.dmn.selectForCompare",
    compareWithSelected: "bpmn-modeler.dmn.compareWithSelected",
    compareSelected: "bpmn-modeler.dmn.compareSelected",
};

// How long the status-bar acknowledgement sits before fading.
const STATUS_MESSAGE_TIMEOUT_MS = 3_000;

/**
 * Bridges VS Code's Explorer context menu to the diff of one file format.
 *
 * Offers two entry points that mirror VS Code's built-in compare UX:
 *
 * - **Two-step** (single right-click at a time): "Select for Compare" stores
 *   the URI in {@link CompareSelectionStore} and activates a context key so
 *   "Compare with Selected" appears on the next right-click.  The second
 *   step opens the diff via {@link DiffController.openCompareFilesDiff} and
 *   clears the selection (one-shot).
 * - **Single-step** (multi-selection of exactly two files): "Compare Selected"
 *   receives both URIs at once via the Explorer's `(uri, uris)` callback
 *   signature, skips the store entirely, and dispatches the same diff-open
 *   path.
 *
 * Both paths funnel through {@link DiffController.openCompareFilesDiff} so
 * session registration, tab-title construction, and error reporting stay in
 * one place — and the swap-sides flow can re-use the exact same entry point.
 *
 * Keeping these commands in their own controller (rather than folding them
 * into {@link CommandController}) respects SRP — compare commands activate
 * from explorer resources and have a different lifecycle than the other,
 * modeler-active commands.
 */
export class CompareController {
    /**
     * @param selection Cross-command store holding the URI picked by the
     *   first step of the workflow.
     * @param diffController Owns diff-session registration; must be notified
     *   *before* `vscode.diff` is invoked so pane resolution finds the
     *   session synchronously.
     * @param notifier User-facing messages and logging.
     * @param format The file format and the IDs of its commands.
     */
    constructor(
        private readonly selection: CompareSelectionStore,
        private readonly diffController: DiffController,
        private readonly notifier: NotifierPort,
        private readonly format: CompareCommands,
    ) {}

    /**
     * Registers both compare commands with VS Code.  Disposables land on
     * `context.subscriptions` for automatic release on extension deactivate.
     */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(this.format.selectForCompare, this.selectForCompare, this),
            commands.registerCommand(
                this.format.compareWithSelected,
                this.compareWithSelected,
                this,
            ),
            commands.registerCommand(this.format.compareSelected, this.compareSelected, this),
        );
    }

    /**
     * Step 1: remember the user's selection as the left-hand side of the
     * upcoming compare.  Non-modal status-bar feedback confirms the pick
     * without interrupting the user's flow.
     */
    async selectForCompare(uri: Uri | undefined): Promise<void> {
        if (!this.isOfFormat(uri)) {
            return;
        }
        await this.selection.set(uri);
        window.setStatusBarMessage(
            selectedForCompareText(basenameOf(uri)),
            STATUS_MESSAGE_TIMEOUT_MS,
        );
    }

    /**
     * Step 2: pair `rightUri` with the previously-selected URI and open a
     * diff tab.
     *
     * Pre-registers a `compare-files` {@link DiffSession} before invoking
     * `vscode.diff`, so when VS Code resolves each pane through our
     * `CustomTextEditorProvider` the diff service routes them through the
     * diff viewer branch via session lookup — no URI-scheme heuristic.
     *
     * Clears the selection after a successful dispatch (one-shot UX,
     * matching VS Code's built-in "Compare with Selected").
     */
    async compareWithSelected(rightUri: Uri | undefined): Promise<void> {
        if (!this.isOfFormat(rightUri)) {
            return;
        }

        const leftUri = this.selection.get();
        if (!leftUri) {
            this.notifier.showInfo(nothingSelectedForCompareText(this.format));
            return;
        }

        if (leftUri.toString() === rightUri.toString()) {
            this.notifier.showInfo(COMPARE_WITH_ITSELF_TEXT);
            return;
        }

        await this.diffController.openCompareFilesDiff(leftUri, rightUri);
        await this.selection.clear();
    }

    /**
     * Single-step compare driven by an Explorer multi-selection.
     *
     * VS Code invokes context-menu commands with `(clickedUri, allSelectedUris)`
     * when the menu fires over a multi-selected list — we ignore the first
     * argument and work from `uris` so selection order determines left/right.
     * The menu is gated on `listDoubleSelection` so there are always exactly
     * two entries; the runtime filter guards against the edge case where the
     * other selected item is of another format (the built-in `resourceExtname`
     * `when` clause only evaluates the clicked resource).
     *
     * Unlike {@link compareWithSelected} this path never touches
     * {@link CompareSelectionStore} — both URIs arrive in one call, so a
     * previously-stored "Select for Compare" pick is intentionally preserved.
     */
    async compareSelected(_uri: Uri | undefined, uris: Uri[] | undefined): Promise<void> {
        const matching = (uris ?? []).filter((candidate) => this.isOfFormat(candidate));
        if (matching.length !== 2) {
            this.notifier.showInfo(selectTwoFilesText(this.format));
            return;
        }

        const [leftUri, rightUri] = matching;
        if (leftUri.toString() === rightUri.toString()) {
            this.notifier.showInfo(COMPARE_WITH_ITSELF_TEXT);
            return;
        }

        await this.diffController.openCompareFilesDiff(leftUri, rightUri);
    }

    private isOfFormat(uri: Uri | undefined): uri is Uri {
        return uri !== undefined && uri.path.endsWith(this.format.extension);
    }
}

function basenameOf(uri: Uri): string {
    const parts = uri.path.split("/");
    return parts[parts.length - 1] ?? uri.path;
}
