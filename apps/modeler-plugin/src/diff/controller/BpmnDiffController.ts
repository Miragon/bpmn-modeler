import {
    commands,
    ConfigurationChangeEvent,
    ExtensionContext,
    TextDocument,
    Uri,
    WebviewPanel,
    window,
    workspace,
} from "vscode";

import {
    Command,
    CursorChangedCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";

import { DiffPaneHandle, DiffSession, basenameOfUriString } from "../domain/DiffSession";
import { bootstrapWebview } from "../../shared/infrastructure/bootstrapWebview";
import { DiffPaneStore } from "../infrastructure/DiffPaneStore";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { WebviewPaneHandle } from "../infrastructure/WebviewPaneHandle";
import { BpmnDiffService } from "../service/BpmnDiffService";

// VS Code view-type identifier for the BPMN custom editor.
const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";

/**
 * URI schemes used by Git-provider extensions to surface ref/index/working-tree
 * documents. VS Code's built-in Git extension uses `git:`; Theia's `@theia/git`
 * (used by the standalone desktop shell) uses `gitfs:`. Both are always
 * readonly and always belong to a diff, so the scheme alone is a sufficient
 * signal for `shouldResolveAsDiff`.
 */
const GIT_PROVIDED_SCHEMES = new Set<string>(["git", "gitfs"]);

/**
 * VS Code-facing surface for the BPMN diff feature.
 *
 * Owns every interaction with `vscode`: deciding whether a resolving editor is
 * a diff pane, opening a `compare-files` diff (`vscode.diff`), bootstrapping a
 * resolved pane, pairing SCM panes, routing webview messages, and the
 * language-setting subscription. The session registry lives in
 * {@link DiffPaneStore} and the diff content logic in {@link BpmnDiffService},
 * both kept vscode-free.
 *
 * The domain moved from "pair of panes with mutual partner pointers" to
 * {@link DiffSession}: an explicit object with fixed `before` / `after` URIs
 * that any diff origin (SCM, `compare-files`) can register into. Pane
 * resolution is a session lookup instead of a scheme-based heuristic.
 */
export class BpmnDiffController {
    /**
     * @param store Session registry (lookups, pending SCM panes, TTL timers).
     * @param diffService Diff content driver (viewer file, differ, sync,
     *   language broadcast).
     * @param notifier Surfaces `vscode.diff` failures to the user.
     */
    constructor(
        private readonly store: DiffPaneStore,
        private readonly diffService: BpmnDiffService,
        private readonly notifier: VsCodeNotifier,
    ) {}

    /**
     * Subscribes to language-setting changes so every open diff pane
     * re-renders its locale-dependent chrome. The disposable lands on
     * `context.subscriptions` for automatic release on extension deactivate.
     */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            workspace.onDidChangeConfiguration((event) => this.onConfigurationChanged(event)),
        );
    }

    /**
     * One-call `compare-files` diff-open: pre-registers the session, invokes
     * `vscode.diff`, and constructs the tab title.
     *
     * Session registration must happen before `vscode.diff` so that when VS
     * Code immediately resolves each pane through the
     * `CustomTextEditorProvider`, pane lookup via {@link DiffPaneStore.findByUri}
     * succeeds synchronously — otherwise the panes would fall through to the
     * SCM label heuristic.
     *
     * Errors from `vscode.diff` are surfaced to the user here so both entry
     * points (`BpmnCompareController` and {@link swapCompareFilesSides}) share
     * the same failure UX.
     */
    async openCompareFilesDiff(leftUri: Uri, rightUri: Uri): Promise<void> {
        this.store.registerCompareFiles(leftUri.toString(), rightUri.toString());
        const title = `${basenameOfUriString(leftUri.toString())} ↔ ${basenameOfUriString(rightUri.toString())}`;
        try {
            await commands.executeCommand("vscode.diff", leftUri, rightUri, title, {
                preview: false,
            });
        } catch (error) {
            this.notifier.logError(error as Error);
            this.notifier.showError(`Failed to open compare view: ${(error as Error).message}`);
        }
    }

    /**
     * Returns `true` when this URI should resolve as a (new) diff pane.
     *
     * Decision tree:
     *   1. A pane (full session or pending SCM entry) already exists for
     *      this URI → false.  The caller is a *second* resolve, e.g. the
     *      user opened the working-tree file in a normal editor tab after
     *      the SCM diff was already open — that second tab is an editable
     *      modeler, not another diff pane.
     *   2. A pre-registered `compare-files` session exists → true.
     *   3. The URI uses a Git-provided scheme (see
     *      {@link GIT_PROVIDED_SCHEMES}) → true. Covers VS Code's `git:` and
     *      Theia's `gitfs:` — both are always readonly and always belong to a
     *      diff.
     *   4. The URI sits in a diff tab per the label heuristic → true.  This
     *      is the only signal for SCM diffs when both URIs share the `file:`
     *      scheme (uncommon but possible for some diff-to-working-tree flows).
     */
    shouldResolveAsDiff(uri: Uri): boolean {
        const needle = uri.toString();
        if (this.store.hasPaneForUri(needle)) {
            return false;
        }
        if (this.store.findByUri(needle)) {
            return true;
        }
        if (GIT_PROVIDED_SCHEMES.has(uri.scheme)) {
            return true;
        }
        return this.isPartOfDiff(uri);
    }

    /**
     * Bootstraps a freshly-resolved diff pane.
     *
     * Resolution paths:
     *   - Pre-registered `compare-files` session: looked up via the store,
     *     pane attaches immediately, TTL cancels.
     *   - First `scm` pane: stashed as pending, waits for partner.
     *   - Second `scm` pane: paired with the pending entry, session created.
     *
     * Nothing about a diff pane flows through `EditorSessionStore`, which keeps the
     * two "same URI" panels (viewer + editable modeler that a user may open
     * alongside the diff) from colliding.
     */
    resolveDiffPane(panel: WebviewPanel, document: TextDocument): void {
        // Register listeners *before* we hand HTML to the webview: VS Code
        // drops webview-originated messages that arrive before the extension
        // has subscribed, and bootstrapping triggers an immediate
        // `GetBpmnFileCommand` as soon as the webview's scripts run.
        const handle = new WebviewPaneHandle(panel, document);

        panel.webview.onDidReceiveMessage((message: Command) => this.onMessage(handle, message));
        panel.onDidDispose(() => this.disposePane(handle));

        const session = this.store.findByUri(handle.uri);
        if (session) {
            session.attachPane(handle);
            this.store.cancelTtl(session);
        } else {
            this.attachOrPendScmPane(handle);
        }

        bootstrapWebview(BPMN_VIEW_TYPE, panel);
    }

    /**
     * Returns `true` when `uri` belongs to an open BPMN diff tab.
     *
     * Label-based heuristic: when a file type has a `CustomTextEditorProvider`
     * registered as default, VS Code's diff tabs surface as `Tab` objects with
     * `input === undefined` — there is no `TabInputTextDiff` / `TabInputCustom`
     * variant to branch on.  The only structural signal left is the label,
     * which every diff annotates with a parenthetical (e.g.
     * `"my-bpmn.bpmn (Working Tree)"`, `"… (HEAD)"`, `"… (HEAD~1 ↔ HEAD)"`)
     * or the `↔` separator used by `vscode.diff(a, b)` when the two basenames
     * differ.
     */
    private isPartOfDiff(uri: Uri): boolean {
        const basename = basenameOfUriString(uri.toString());
        if (!basename.endsWith(".bpmn")) {
            return false;
        }
        for (const group of window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input !== undefined) {
                    continue;
                }
                if (tab.label.startsWith(`${basename} (`) || tab.label.includes(` ↔ `)) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Either pairs `handle` with a pending SCM pane that shares its path
     * (promoting both into a full {@link DiffSession}) or stashes `handle`
     * as the pending pane for later pairing.
     *
     * Side assignment for SCM:
     *   - If one URI is `file:` it is the working tree → `after`.
     *   - Otherwise (ref-vs-ref, both `git:`) the first-registered pane is
     *     `before`, second is `after` — arbitrary but matches the visual
     *     order VS Code's SCM diff chose.
     */
    private attachOrPendScmPane(handle: WebviewPaneHandle): void {
        const key = this.scmPairingKey(handle.document.uri);
        const pending = this.store.getPendingScm(key);

        if (!pending) {
            this.store.addPendingScm(key, handle);
            return;
        }

        this.store.deletePendingScm(key);
        const { before, after } = resolveScmSides(pending, handle);
        const session = DiffSession.forScm(before, after);
        session.attachPane(before);
        session.attachPane(after);
        this.store.index(session);
    }

    /**
     * Pairing key for matching the two panes of an SCM diff. Both VS Code
     * (`git:foo.bpmn` ↔ `file:foo.bpmn`) and Theia (`gitfs:foo.bpmn` ↔
     * `file:foo.bpmn`) surface the two sides with different schemes but the
     * same workspace-relative `uri.path`, so the raw path is the pairing key.
     *
     * If a future host bakes ref metadata into the path (e.g.
     * `/foo.bpmn@HEAD`), normalize it here so the two paths still meet.
     */
    private scmPairingKey(uri: Uri): string {
        return uri.path;
    }

    private disposePane(handle: DiffPaneHandle): void {
        // Drop from pending (no session ever formed).
        if (this.store.removePendingByHandle(handle)) {
            return;
        }

        // Drop from session; retire the session if both panes are gone.
        const session = this.store.findByUri(handle.uri);
        if (!session) {
            return;
        }
        session.detachPane(handle);
        if (session.isEmpty()) {
            this.store.remove(session);
        }
    }

    private async onMessage(handle: DiffPaneHandle, message: Command): Promise<void> {
        switch (message.type) {
            case "GetBpmnFileCommand":
                await this.diffService.sendViewerFile(handle);
                break;
            case "DiffReadyCommand":
                await this.diffService.markReady(handle);
                break;
            case "ViewportChangedCommand":
                await this.diffService.forwardViewport(
                    handle,
                    (message as ViewportChangedCommand).viewport,
                );
                break;
            case "CursorChangedCommand":
                await this.diffService.forwardCursor(
                    handle,
                    (message as CursorChangedCommand).index,
                );
                break;
            case "SwapCompareSidesCommand":
                await this.swapCompareFilesSides(handle);
                break;
        }
    }

    /**
     * Closes the current diff tab and reopens it with the two URIs swapped.
     *
     * Only applies to `compare-files` sessions: the extension owns both URIs
     * and the tab title, so it can legitimately retire and recreate the diff.
     * SCM panes never emit `SwapCompareSidesCommand` — the button is hidden
     * there — but we still guard against misuse since message routing cannot
     * encode origin at the type level.
     *
     * Disposing the webview panels triggers {@link disposePane} for both
     * sides, which tears down the old session and removes it from the
     * indexes.  The subsequent {@link openCompareFilesDiff} then registers a
     * fresh session with the reversed before/after assignment.
     */
    private async swapCompareFilesSides(handle: DiffPaneHandle): Promise<void> {
        const session = this.store.findByUri(handle.uri);
        if (!session || session.origin !== "compare-files") {
            return;
        }
        const { beforeUri, afterUri } = session;
        for (const pane of session.attachedPanes()) {
            pane.dispose();
        }
        await this.openCompareFilesDiff(Uri.parse(afterUri), Uri.parse(beforeUri));
    }

    /**
     * Re-posts the current locale to every ready diff pane when the user
     * changes `miragon.bpmnModeler.language`.  Ignores unrelated setting
     * changes so panes only churn when the language actually moves.
     */
    private onConfigurationChanged(event: ConfigurationChangeEvent): void {
        if (!event.affectsConfiguration("miragon.bpmnModeler.language")) {
            return;
        }
        this.diffService.rebroadcastLanguage();
    }
}

/**
 * SCM-diff side assignment for two panes that share a path.
 *
 * Invariant: `file:` URIs represent the working tree and must be `after`.
 * For ref-vs-ref diffs (both `git:` in VS Code, both `gitfs:` in Theia) side
 * follows resolution order, which mirrors the host's own visual ordering.
 *
 * The scheme is read from each handle's stringified `uri` (round-trips
 * identically to `document.uri.scheme`), so this works on the abstract
 * {@link DiffPaneHandle} without reaching for the concrete panel.
 */
function resolveScmSides(
    first: DiffPaneHandle,
    second: DiffPaneHandle,
): { before: DiffPaneHandle; after: DiffPaneHandle } {
    if (Uri.parse(second.uri).scheme === "file") {
        return { before: first, after: second };
    }
    if (Uri.parse(first.uri).scheme === "file") {
        return { before: second, after: first };
    }
    return { before: first, after: second };
}
