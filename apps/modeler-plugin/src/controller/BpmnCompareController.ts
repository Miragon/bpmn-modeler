import { commands, ExtensionContext, Uri, window } from "vscode";

import { CompareSelectionStore } from "../infrastructure/CompareSelectionStore";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { BpmnDiffService } from "../service/BpmnDiffService";

/** VS Code command ID for the first step of a two-file BPMN compare. */
const SELECT_FOR_COMPARE_CMD = "bpmn-modeler.selectForCompare";
/** VS Code command ID for the second step — compares the given URI against the stored selection. */
const COMPARE_WITH_SELECTED_CMD = "bpmn-modeler.compareWithSelected";
/** VS Code command ID for the single-step compare driven by an Explorer multi-selection of exactly two files. */
const COMPARE_SELECTED_CMD = "bpmn-modeler.compareSelected";

/** How long the status-bar acknowledgement sits before fading. */
const STATUS_MESSAGE_TIMEOUT_MS = 3_000;

/**
 * Bridges VS Code's Explorer context menu to the existing BPMN diff UI.
 *
 * Offers two entry points that mirror VS Code's built-in compare UX:
 *
 * - **Two-step** (single right-click at a time): "Select for Compare" stores
 *   the URI in {@link CompareSelectionStore} and activates a context key so
 *   "Compare with Selected" appears on the next right-click.  The second
 *   step opens the diff via {@link BpmnDiffService.openCompareFilesDiff} and
 *   clears the selection (one-shot).
 * - **Single-step** (multi-selection of exactly two files): "Compare Selected"
 *   receives both URIs at once via the Explorer's `(uri, uris)` callback
 *   signature, skips the store entirely, and dispatches the same diff-open
 *   path.
 *
 * Both paths funnel through {@link BpmnDiffService.openCompareFilesDiff} so
 * session registration, tab-title construction, and error reporting stay in
 * one place — and the swap-sides flow can re-use the exact same entry point.
 *
 * Keeping these commands in their own controller (rather than folding them
 * into {@link CommandController}) respects SRP — compare commands activate
 * from explorer resources and have a different lifecycle than the other,
 * modeler-active commands.
 */
export class BpmnCompareController {
    /**
     * @param selection Cross-command store holding the URI picked by the
     *   first step of the workflow.
     * @param diffService Owns diff-session registration; must be notified
     *   *before* `vscode.diff` is invoked so pane resolution finds the
     *   session synchronously.
     * @param vsUI User-facing messages and logging.
     */
    constructor(
        private readonly selection: CompareSelectionStore,
        private readonly diffService: BpmnDiffService,
        private readonly vsUI: VsCodeUI,
    ) {}

    /**
     * Registers both compare commands with VS Code.  Disposables land on
     * `context.subscriptions` for automatic release on extension deactivate.
     */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(SELECT_FOR_COMPARE_CMD, this.selectForCompare, this),
            commands.registerCommand(COMPARE_WITH_SELECTED_CMD, this.compareWithSelected, this),
            commands.registerCommand(COMPARE_SELECTED_CMD, this.compareSelected, this),
        );
    }

    /**
     * Step 1: remember the user's selection as the left-hand side of the
     * upcoming compare.  Non-modal status-bar feedback confirms the pick
     * without interrupting the user's flow.
     */
    async selectForCompare(uri: Uri | undefined): Promise<void> {
        if (!isBpmnUri(uri)) {
            return;
        }
        await this.selection.set(uri);
        window.setStatusBarMessage(
            `BPMN Modeler: ${basenameOf(uri)} selected for compare`,
            STATUS_MESSAGE_TIMEOUT_MS,
        );
    }

    /**
     * Step 2: pair `rightUri` with the previously-selected URI and open a
     * BPMN diff tab.
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
        if (!isBpmnUri(rightUri)) {
            return;
        }

        const leftUri = this.selection.get();
        if (!leftUri) {
            this.vsUI.showInfo(
                'No file selected for compare. Right-click a .bpmn file and choose "Select for Compare" first.',
            );
            return;
        }

        if (leftUri.toString() === rightUri.toString()) {
            this.vsUI.showInfo("Cannot compare a file with itself.");
            return;
        }

        await this.diffService.openCompareFilesDiff(leftUri, rightUri);
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
     * other selected item is not `.bpmn` (the built-in `resourceExtname`
     * `when` clause only evaluates the clicked resource).
     *
     * Unlike {@link compareWithSelected} this path never touches
     * {@link CompareSelectionStore} — both URIs arrive in one call, so a
     * previously-stored "Select for Compare" pick is intentionally preserved.
     */
    async compareSelected(_uri: Uri | undefined, uris: Uri[] | undefined): Promise<void> {
        const bpmnUris = (uris ?? []).filter(isBpmnUri);
        if (bpmnUris.length !== 2) {
            this.vsUI.showInfo("Select exactly two .bpmn files to compare.");
            return;
        }

        const [leftUri, rightUri] = bpmnUris;
        if (leftUri.toString() === rightUri.toString()) {
            this.vsUI.showInfo("Cannot compare a file with itself.");
            return;
        }

        await this.diffService.openCompareFilesDiff(leftUri, rightUri);
    }
}

function isBpmnUri(uri: Uri | undefined): uri is Uri {
    return uri !== undefined && uri.path.endsWith(".bpmn");
}

function basenameOf(uri: Uri): string {
    const parts = uri.path.split("/");
    return parts[parts.length - 1] ?? uri.path;
}
