// Bundler (webpack + ts-loader) does not pick up ambient module declarations
// from `src/types/*.d.ts` via tsconfig `include` alone — it honours explicit
// triple-slash references though.  `tsc --noEmit` handles both, but the
// bundler path is the one that ships the extension, so the references are
// required for the production build.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/bpmn-js-differ.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/bpmn-moddle.d.ts" />
import { diff } from "bpmn-js-differ";

import {
    ApplyDiffHighlightsQuery,
    BpmnFileQuery,
    buildFlowOrder,
    buildRemovedAnchors,
    Command,
    CursorChangedCommand,
    DiffCounts,
    LanguageQuery,
    sortIdsByOrder,
    SyncCursorQuery,
    SyncViewportQuery,
    ViewportChangedCommand,
} from "@bpmn-modeler/shared";

import { commands, ConfigurationChangeEvent, Disposable, TextDocument, Uri, WebviewPanel, window, workspace } from "vscode";

import { bootstrapWebview } from "../infrastructure/bootstrapWebview";
import { VsCodeSettings } from "../infrastructure/VsCodeSettings";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { detectExecutionPlatform } from "./bpmnUtils";
import { DiffPaneEntry, DiffSession } from "./DiffSession";

const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";

/**
 * Milliseconds a pre-registered `compare-files` session stays alive with no
 * panes attached before it is swept.  Covers the "user triggered the command
 * but the diff tab never opened" edge case.  Longer than any realistic
 * `vscode.diff` → `resolveCustomTextEditor` latency; short enough that
 * registering the same pair again after a cancel works without collisions.
 */
const COMPARE_FILES_TTL_MS = 30_000;

/**
 * A `"scm"` pane that resolved first and is waiting for its partner.
 *
 * SCM-initiated diffs don't let us pre-register a session — we learn about
 * each URI only when its pane resolves.  The first pane goes here; when the
 * second pane arrives with a matching `document.uri.path`, we promote both
 * into a full {@link DiffSession} and register it.
 */
interface PendingScmPane {
    readonly entry: DiffPaneEntry;
}

/**
 * Owns every BPMN diff viewer pane from resolution through disposal.
 *
 * The domain moved from "pair of panes with mutual partner pointers" to
 * {@link DiffSession}: an explicit object with fixed `before` / `after` URIs
 * that any diff origin (SCM, `compare-files`) can register into.  The service
 * is now a registry of sessions plus a per-URI lookup index; pane resolution
 * is a session lookup instead of a scheme-based heuristic.
 *
 * Responsibilities:
 *   1. Register `compare-files` sessions on demand — pre-known URIs, side
 *      fixed at construction, TTL-swept if the tab never opens.
 *   2. Lazily create `scm` sessions when VS Code resolves a diff tab's second
 *      pane — URIs discovered at resolve time, paired by path equality.
 *   3. Bootstrap the webview for each resolved pane, wire up the viewer-mode
 *      message protocol (`GetBpmnFileCommand`, `DiffReadyCommand`,
 *      `ViewportChangedCommand`, `CursorChangedCommand`), and attach the pane
 *      to its session.
 *   4. Once both panes of a session report ready, run `bpmn-js-differ` on the
 *      parsed XMLs and broadcast per-side {@link ApplyDiffHighlightsQuery}.
 *   5. Forward viewport-change and cursor-change messages from one pane to
 *      its partner so panning, zooming, and stepper navigation stay in sync.
 */
export class BpmnDiffService {
    /** Every live session, keyed by `${beforeUri}|${afterUri}`. */
    private readonly sessions = new Map<string, DiffSession>();

    /**
     * Lookup index: URI string → session it belongs to.  Populated as soon as
     * a session is created, whether pre-registered (`compare-files`) or
     * lazily formed (`scm`).
     */
    private readonly sessionByUri = new Map<string, DiffSession>();

    /**
     * SCM panes awaiting their partner.  Keyed by `document.uri.path` so
     * `git:foo.bpmn` and `file:foo.bpmn` meet here before being promoted into
     * a session.
     */
    private readonly pendingScm = new Map<string, PendingScmPane>();

    /**
     * TTL sweepers for pre-registered `compare-files` sessions.  Cleared
     * once the first pane attaches.
     */
    private readonly ttlTimers = new Map<DiffSession, ReturnType<typeof setTimeout>>();

    /** Dispose handle for the language-setting change subscription. */
    private languageSubscription?: Disposable;

    /**
     * @param vsUI Logging helper for parse failures and dropped posts.
     * @param vsSettings Settings reader — provides the active UI locale so
     *   each diff pane's legend and chrome render in the user's language from
     *   the moment it opens, and re-renders on setting changes.
     */
    constructor(
        private readonly vsUI: VsCodeUI,
        private readonly vsSettings: VsCodeSettings,
    ) {
        this.languageSubscription = workspace.onDidChangeConfiguration((event) =>
            this.onConfigurationChanged(event),
        );
    }

    /** Releases the language-setting subscription and any armed TTL timers. */
    dispose(): void {
        this.languageSubscription?.dispose();
        this.languageSubscription = undefined;
        for (const timer of this.ttlTimers.values()) {
            clearTimeout(timer);
        }
        this.ttlTimers.clear();
    }

    /**
     * Pre-registers a `compare-files` session before invoking `vscode.diff`.
     *
     * Side assignment is fixed: `leftUri` is `before`, `rightUri` is `after`
     * — matches the visual order VS Code renders `vscode.diff(a, b)` in.
     *
     * A TTL sweeper drops the session if no pane attaches within
     * {@link COMPARE_FILES_TTL_MS}.  The timer is cleared as soon as the
     * first pane arrives.
     *
     * @returns The created session (useful in tests; production callers can
     *   ignore the return value).
     */
    registerCompareFilesSession(leftUri: Uri, rightUri: Uri): DiffSession {
        const session = DiffSession.forCompareFiles(leftUri, rightUri);
        this.indexSession(session);
        this.ttlTimers.set(
            session,
            setTimeout(() => this.sweepOrphan(session), COMPARE_FILES_TTL_MS),
        );
        return session;
    }

    /**
     * One-call `compare-files` diff-open: pre-registers the session, invokes
     * `vscode.diff`, and constructs the tab title.
     *
     * Session registration must happen before `vscode.diff` so that when VS
     * Code immediately resolves each pane through the
     * `CustomTextEditorProvider`, pane lookup via {@link findSessionFor}
     * succeeds synchronously — otherwise the panes would fall through to the
     * SCM label heuristic.
     *
     * Errors from `vscode.diff` are surfaced to the user here so both entry
     * points ({@link BpmnCompareController} and {@link swapCompareFilesSides})
     * share the same failure UX.
     */
    async openCompareFilesDiff(leftUri: Uri, rightUri: Uri): Promise<void> {
        this.registerCompareFilesSession(leftUri, rightUri);
        const title = `${basenameOfUri(leftUri)} ↔ ${basenameOfUri(rightUri)}`;
        try {
            await commands.executeCommand(
                "vscode.diff",
                leftUri,
                rightUri,
                title,
                { preview: false },
            );
        } catch (error) {
            this.vsUI.logError(error as Error);
            this.vsUI.showError(
                `Failed to open compare view: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Returns the session this URI belongs to, or `undefined` when none
     * exists yet.  Covers both pre-registered `compare-files` sessions and
     * `scm` sessions that have already been promoted from a pending pane.
     */
    findSessionFor(uri: Uri): DiffSession | undefined {
        return this.sessionByUri.get(uri.toString());
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
     *   3. The URI is a `git:` scheme → true.  Git-provided documents are
     *      always readonly and always belong to a diff.
     *   4. The URI sits in a diff tab per the label heuristic → true.  This
     *      is the only signal for SCM diffs when both URIs share the `file:`
     *      scheme (uncommon but possible for some diff-to-working-tree flows).
     */
    shouldResolveAsDiff(uri: Uri): boolean {
        if (this.hasPaneForUri(uri)) {
            return false;
        }
        if (this.findSessionFor(uri)) {
            return true;
        }
        if (uri.scheme === "git") {
            return true;
        }
        return this.isPartOfDiff(uri);
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
    isPartOfDiff(uri: Uri): boolean {
        const basename = basenameOfUri(uri);
        if (!basename.endsWith(".bpmn")) {
            return false;
        }
        for (const group of window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input !== undefined) {
                    continue;
                }
                if (
                    tab.label.startsWith(`${basename} (`) ||
                    tab.label.includes(` ↔ `)
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Returns `true` when any pane — attached to a session or still pending
     * SCM pairing — currently renders `uri`.
     */
    hasPaneForUri(uri: Uri): boolean {
        const needle = uri.toString();
        const session = this.sessionByUri.get(needle);
        if (session?.hasPaneFor(uri)) {
            return true;
        }
        for (const pending of this.pendingScm.values()) {
            if (pending.entry.document.uri.toString() === needle) {
                return true;
            }
        }
        return false;
    }

    /**
     * Bootstraps a freshly-resolved diff pane.
     *
     * Resolution paths:
     *   - Pre-registered `compare-files` session: looked up via
     *     {@link sessionByUri}, pane attaches immediately, TTL cancels.
     *   - First `scm` pane: stashed in {@link pendingScm}, waits for partner.
     *   - Second `scm` pane: paired with the pending entry, session created.
     *
     * Nothing about a diff pane flows through `EditorStore`, which keeps the
     * two "same URI" panels (viewer + editable modeler that a user may open
     * alongside the diff) from colliding.
     */
    resolveDiffPane(panel: WebviewPanel, document: TextDocument): void {
        // Register listeners *before* we hand HTML to the webview: VS Code
        // drops webview-originated messages that arrive before the extension
        // has subscribed, and bootstrapping triggers an immediate
        // `GetBpmnFileCommand` as soon as the webview's scripts run.
        const entry: DiffPaneEntry = {
            panel,
            document,
            ready: false,
        };

        panel.webview.onDidReceiveMessage((message: Command) =>
            this.onMessage(entry, message),
        );
        panel.onDidDispose(() => this.disposePane(entry));

        const session = this.findSessionFor(document.uri);
        if (session) {
            session.attachPane(entry);
            this.cancelTtl(session);
        } else {
            this.attachOrPendScmPane(entry);
        }

        bootstrapWebview(BPMN_VIEW_TYPE, panel);
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    /**
     * Either pairs `entry` with a pending SCM pane that shares its path
     * (promoting both into a full {@link DiffSession}) or stashes `entry`
     * as the pending pane for later pairing.
     *
     * Side assignment for SCM:
     *   - If one URI is `file:` it is the working tree → `after`.
     *   - Otherwise (ref-vs-ref, both `git:`) the first-registered pane is
     *     `before`, second is `after` — arbitrary but matches the visual
     *     order VS Code's SCM diff chose.
     */
    private attachOrPendScmPane(entry: DiffPaneEntry): void {
        const path = entry.document.uri.path;
        const pending = this.pendingScm.get(path);

        if (!pending) {
            this.pendingScm.set(path, { entry });
            return;
        }

        this.pendingScm.delete(path);
        const { session, before, after } = DiffSession.forScm(
            pending.entry,
            entry,
        );
        session.attachPane(before);
        session.attachPane(after);
        this.indexSession(session);
    }

    /**
     * Adds `session` to the `sessions` map and the per-URI lookup index.
     *
     * Both session-creation paths (eager `compare-files` and lazy `scm`)
     * funnel through here so the two maps never drift out of sync.
     */
    private indexSession(session: DiffSession): void {
        this.sessions.set(this.sessionIdOf(session), session);
        this.sessionByUri.set(session.beforeUri.toString(), session);
        this.sessionByUri.set(session.afterUri.toString(), session);
    }

    private sessionIdOf(session: DiffSession): string {
        return `${session.beforeUri.toString()}|${session.afterUri.toString()}`;
    }

    private cancelTtl(session: DiffSession): void {
        const timer = this.ttlTimers.get(session);
        if (timer) {
            clearTimeout(timer);
            this.ttlTimers.delete(session);
        }
    }

    private sweepOrphan(session: DiffSession): void {
        this.ttlTimers.delete(session);
        if (!session.isEmpty()) {
            return;
        }
        this.sessions.delete(this.sessionIdOf(session));
        this.sessionByUri.delete(session.beforeUri.toString());
        this.sessionByUri.delete(session.afterUri.toString());
    }

    private disposePane(entry: DiffPaneEntry): void {
        // Drop from pending (no session ever formed)
        for (const [key, pending] of this.pendingScm) {
            if (pending.entry === entry) {
                this.pendingScm.delete(key);
                return;
            }
        }

        // Drop from session; retire the session if both panes are gone.
        const session = this.sessionByUri.get(entry.document.uri.toString());
        if (!session) {
            return;
        }
        session.detachPane(entry);
        if (session.isEmpty()) {
            this.sessions.delete(this.sessionIdOf(session));
            this.sessionByUri.delete(session.beforeUri.toString());
            this.sessionByUri.delete(session.afterUri.toString());
            this.cancelTtl(session);
        }
    }

    private async onMessage(
        entry: DiffPaneEntry,
        message: Command,
    ): Promise<void> {
        switch (message.type) {
            case "GetBpmnFileCommand":
                await this.sendViewerFile(entry);
                break;
            case "DiffReadyCommand":
                await this.markReady(entry);
                break;
            case "ViewportChangedCommand":
                await this.forwardViewport(
                    entry,
                    (message as ViewportChangedCommand).viewport,
                );
                break;
            case "CursorChangedCommand":
                await this.forwardCursor(
                    entry,
                    (message as CursorChangedCommand).index,
                );
                break;
            case "SwapCompareSidesCommand":
                await this.swapCompareFilesSides(entry);
                break;
        }
    }

    /**
     * Closes the current diff tab and reopens it with the two URIs swapped.
     *
     * Only applies to `compare-files` sessions: the extension owns both URIs
     * and the tab title, so it can legitimately retire and recreate the diff.
     * SCM panes never emit {@link SwapCompareSidesCommand} — the button is
     * hidden there — but we still guard against misuse since message routing
     * cannot encode origin at the type level.
     *
     * Disposing the webview panels triggers `disposePane` for both sides,
     * which tears down the old session and removes it from the indexes.  The
     * subsequent `openCompareFilesDiff` then registers a fresh session with
     * the reversed before/after assignment.
     */
    private async swapCompareFilesSides(entry: DiffPaneEntry): Promise<void> {
        const session = this.sessionByUri.get(entry.document.uri.toString());
        if (!session || session.origin !== "compare-files") {
            return;
        }
        const { beforeUri, afterUri } = session;
        for (const pane of session.attachedPanes()) {
            pane.panel.dispose();
        }
        await this.openCompareFilesDiff(afterUri, beforeUri);
    }

    /**
     * Replies to the webview's initial `GetBpmnFileCommand` with the pane's
     * XML in viewer mode.  Engine detection is best-effort — diagrams without
     * an execution-platform attribute fall back to `"c7"`, since viewer mode
     * does not render engine-specific extensions anyway.
     */
    private async sendViewerFile(entry: DiffPaneEntry): Promise<void> {
        try {
            const content = entry.document.getText();
            let engine: "c7" | "c8";
            try {
                engine = detectExecutionPlatform(content);
            } catch {
                engine = "c7";
            }
            await entry.panel.webview.postMessage(
                new BpmnFileQuery(content, engine, "viewer"),
            );
        } catch (error) {
            this.vsUI.logError(error as Error);
        }
    }

    private async markReady(entry: DiffPaneEntry): Promise<void> {
        entry.ready = true;
        await this.sendLanguage(entry);

        const session = this.sessionByUri.get(entry.document.uri.toString());
        if (!session || !session.isArmed()) {
            return;
        }
        const before = session.before();
        const after = session.after();
        if (before && after) {
            await this.computeAndBroadcast(session, before, after);
        }
    }

    /**
     * Posts the current UI locale to the given pane so its legend and other
     * non-bpmn-js UI render in the user's language.  Silently drops the post
     * when the pane is hidden or already disposed — the pane will request the
     * language again on its next resolve.
     */
    private async sendLanguage(entry: DiffPaneEntry): Promise<void> {
        try {
            await entry.panel.webview.postMessage(
                new LanguageQuery(this.vsSettings.getLanguage()),
            );
        } catch (error) {
            this.vsUI.logInfo(
                `setLanguage dropped: ${(error as Error).message}`,
            );
        }
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
        for (const session of this.sessions.values()) {
            for (const entry of session.attachedPanes()) {
                if (entry.ready) {
                    void this.sendLanguage(entry);
                }
            }
        }
    }

    /**
     * Posts the partner's viewport change to this pane so panning/zoom stays
     * in lockstep.  Silently drops posts when the partner is hidden or gone.
     */
    private async forwardViewport(
        entry: DiffPaneEntry,
        viewport: ViewportChangedCommand["viewport"],
    ): Promise<void> {
        const partner = this.partnerOf(entry);
        if (!partner) {
            return;
        }
        try {
            await partner.panel.webview.postMessage(
                new SyncViewportQuery(viewport),
            );
        } catch (error) {
            this.vsUI.logInfo(
                `syncViewport dropped: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Posts the partner's stepper cursor change so both panes' Next/Prev
     * navigation stays in lockstep.  Mirrors {@link forwardViewport} — same
     * partner lookup, same drop-silently-on-failure semantics.
     */
    private async forwardCursor(
        entry: DiffPaneEntry,
        index: number,
    ): Promise<void> {
        const partner = this.partnerOf(entry);
        if (!partner) {
            return;
        }
        try {
            await partner.panel.webview.postMessage(new SyncCursorQuery(index));
        } catch (error) {
            this.vsUI.logInfo(
                `syncCursor dropped: ${(error as Error).message}`,
            );
        }
    }

    private partnerOf(entry: DiffPaneEntry): DiffPaneEntry | undefined {
        const session = this.sessionByUri.get(entry.document.uri.toString());
        return session?.partnerOf(entry);
    }

    /**
     * Parses both panes' XML, runs `bpmn-js-differ`, and posts a side-targeted
     * {@link ApplyDiffHighlightsQuery} to each webview.  Each side receives
     * only the ids present on its own canvas:
     *   - `_removed` elements exist only on `before`.
     *   - `_added` elements exist only on `after`.
     *   - `_changed` and `_layoutChanged` elements exist on both.
     */
    private async computeAndBroadcast(
        session: DiffSession,
        before: DiffPaneEntry,
        after: DiffPaneEntry,
    ): Promise<void> {
        const beforeXml = before.document.getText();
        const afterXml = after.document.getText();

        let beforeDefs: unknown;
        let afterDefs: unknown;
        try {
            // `bpmn-moddle` has no `default` export — its ESM dist only
            // re-exports the factory as `BpmnModdle`.  Webpack's ESM→CJS
            // interop does not synthesize `.default`, so we accept both
            // shapes for forward-compat across bundler upgrades.
            const moddleMod = (await import("bpmn-moddle")) as unknown as {
                default?: () => {
                    fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
                };
                BpmnModdle?: () => {
                    fromXML: (xml: string) => Promise<{ rootElement: unknown }>;
                };
            };
            const createBpmnModdle = moddleMod.default ?? moddleMod.BpmnModdle;
            if (typeof createBpmnModdle !== "function") {
                throw new Error(
                    "bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.",
                );
            }
            const moddle = createBpmnModdle();
            beforeDefs = (await moddle.fromXML(beforeXml)).rootElement;
            afterDefs = (await moddle.fromXML(afterXml)).rootElement;
        } catch (error) {
            this.vsUI.logError(error as Error);
            return;
        }

        const result = diff(
            beforeDefs as Parameters<typeof diff>[0],
            afterDefs as Parameters<typeof diff>[1],
        );

        const added = Object.keys(result._added);
        const removed = Object.keys(result._removed);
        const changed = Object.keys(result._changed);
        const layoutChanged = Object.keys(result._layoutChanged);
        const counts: DiffCounts = {
            added: added.length,
            removed: removed.length,
            changed: changed.length,
            layoutChanged: layoutChanged.length,
        };

        // Order all id arrays by sequence-flow position so the diff stepper
        // walks from start event to end event instead of in the differ's
        // arbitrary insertion order.  Removed elements live only on the
        // before canvas; anchor each one next to a surviving neighbour in the
        // after order so it appears near where it used to be in the flow.
        const afterOrder = buildFlowOrder(afterDefs as never);
        const removedAnchors = buildRemovedAnchors(
            removed,
            beforeDefs as never,
            afterOrder,
        );
        const sortedAdded = sortIdsByOrder(added, afterOrder);
        const sortedRemoved = sortIdsByOrder(removed, removedAnchors);
        const sortedChanged = sortIdsByOrder(changed, afterOrder);
        const sortedLayoutChanged = sortIdsByOrder(layoutChanged, afterOrder);

        // Merged navigation order: dedup across categories, then sort once
        // more so removed elements interleave with added/changed at their
        // anchored positions instead of sitting in their own block.
        const merged: string[] = [];
        const seen = new Set<string>();
        for (const id of [
            ...sortedAdded,
            ...sortedRemoved,
            ...sortedChanged,
            ...sortedLayoutChanged,
        ]) {
            if (!seen.has(id)) {
                seen.add(id);
                merged.push(id);
            }
        }
        const navigationOrder = sortIdsByOrder(merged, afterOrder, removedAnchors);

        await this.postHighlights(
            before.panel,
            new ApplyDiffHighlightsQuery(
                "before",
                [],
                sortedRemoved,
                sortedChanged,
                sortedLayoutChanged,
                counts,
                navigationOrder,
                session.origin,
                basenameOfUri(before.document.uri),
            ),
        );
        await this.postHighlights(
            after.panel,
            new ApplyDiffHighlightsQuery(
                "after",
                sortedAdded,
                [],
                sortedChanged,
                sortedLayoutChanged,
                counts,
                navigationOrder,
                session.origin,
                basenameOfUri(after.document.uri),
            ),
        );
    }

    private async postHighlights(
        panel: WebviewPanel,
        query: ApplyDiffHighlightsQuery,
    ): Promise<void> {
        try {
            await panel.webview.postMessage(query);
        } catch (error) {
            this.vsUI.logInfo(
                `ApplyDiffHighlights dropped: ${(error as Error).message}`,
            );
        }
    }
}

function basenameOfUri(uri: Uri): string {
    const parts = uri.path.split("/");
    return parts[parts.length - 1] ?? "";
}
