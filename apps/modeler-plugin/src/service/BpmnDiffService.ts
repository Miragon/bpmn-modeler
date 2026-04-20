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
    DiffSide,
    LanguageQuery,
    sortIdsByOrder,
    SyncCursorQuery,
    SyncViewportQuery,
    ViewportChangedCommand,
} from "@bpmn-modeler/shared";

import { ConfigurationChangeEvent, Disposable, TextDocument, Uri, WebviewPanel, window, workspace } from "vscode";

import { bootstrapWebview } from "../infrastructure/bootstrapWebview";
import { VsCodeSettings } from "../infrastructure/VsCodeSettings";
import { VsCodeUI } from "../infrastructure/VsCodeUI";
import { detectExecutionPlatform } from "./bpmnUtils";

const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";

/**
 * Mutable state for one side of an open diff.  Two entries — one per pane —
 * form a pair via their mutual `partner` back-pointers; the pair fires its
 * highlight computation as soon as both sides have reported ready.
 */
interface DiffPaneEntry {
    readonly panel: WebviewPanel;
    readonly document: TextDocument;
    readonly side: DiffSide;
    ready: boolean;
    partner?: DiffPaneEntry;
}

/**
 * Owns every BPMN diff viewer pane from resolution through disposal.
 *
 * Keying on {@link WebviewPanel} rather than a string id solves the identity
 * problem that the URI-keyed `EditorStore` cannot: VS Code happily creates
 * two panels for the same `file:` URI (the working-tree pane of a diff and
 * a normal editor tab) and both need independent message routing, disposal
 * handling, and document access.  Diff panes never touch `EditorStore`, so
 * there is no collision to work around.
 *
 * Responsibilities:
 *   1. Detect whether a URI belongs to an open `.bpmn` diff tab — purely by
 *      tab label, because VS Code exposes `tab.input === undefined` for
 *      custom-editor-backed diff tabs and no typed signal is available.
 *   2. Bootstrap the webview for a newly-resolved diff pane, wire up the
 *      narrow viewer-mode message protocol (`GetBpmnFileCommand`,
 *      `DiffReadyCommand`, `ViewportChangedCommand`, `CursorChangedCommand`),
 *      and link the pane to its partner by shared file path.
 *   3. Once both panes of a pair are ready, run `bpmn-js-differ` on the
 *      parsed XMLs and broadcast per-side {@link ApplyDiffHighlightsQuery}.
 *   4. Forward viewport-change and cursor-change messages from one pane to
 *      its partner so panning, zooming, and stepper navigation stay in sync.
 */
export class BpmnDiffService {
    /** Every live diff pane, keyed by its {@link WebviewPanel} reference. */
    private readonly panes = new Map<WebviewPanel, DiffPaneEntry>();

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

    /** Releases the language-setting subscription.  Called when the extension deactivates. */
    dispose(): void {
        this.languageSubscription?.dispose();
        this.languageSubscription = undefined;
    }

    /**
     * Returns `true` when `uri` belongs to an open BPMN diff tab.
     *
     * Label-based heuristic: when a file type has a `CustomTextEditorProvider`
     * registered as default, VS Code's diff tabs surface as `Tab` objects with
     * `input === undefined` — there is no `TabInputTextDiff` / `TabInputCustom`
     * variant to branch on.  The only structural signal left is the label,
     * which every diff annotates with a parenthetical (e.g.
     * `"my-bpmn.bpmn (Working Tree)"`, `"… (HEAD)"`, `"… (HEAD~1 ↔ HEAD)"`).
     */
    isPartOfDiff(uri: Uri): boolean {
        const basename = basenameOfUri(uri);
        if (!basename.endsWith(".bpmn")) {
            return false;
        }
        for (const group of window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (
                    tab.input === undefined &&
                    tab.label.startsWith(`${basename} (`)
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Returns `true` when a diff pane has already been resolved for the given
     * URI.  Used by the editor controller to distinguish "this URI is part of
     * a diff and has not yet resolved a viewer pane" from "this URI already
     * has a diff viewer and the current resolve is a second, editable tab".
     */
    hasPaneForUri(uri: Uri): boolean {
        const needle = uri.toString();
        for (const entry of this.panes.values()) {
            if (entry.document.uri.toString() === needle) {
                return true;
            }
        }
        return false;
    }

    /**
     * Bootstraps a freshly-resolved diff pane: installs the webview HTML,
     * registers the viewer-mode message and dispose listeners, and pairs the
     * pane with its partner if one already resolved for the same file path.
     *
     * The controller hands the `WebviewPanel` and `TextDocument` directly —
     * nothing about the diff pane flows through `EditorStore`, which keeps
     * the two "same URI" panels (viewer + editable modeler) from colliding.
     */
    resolveDiffPane(panel: WebviewPanel, document: TextDocument): void {
        // Register listeners *before* we hand HTML to the webview: VS Code
        // drops webview-originated messages that arrive before the extension
        // has subscribed, and bootstrapping triggers an immediate
        // `GetBpmnFileCommand` as soon as the webview's scripts run.
        const entry: DiffPaneEntry = {
            panel,
            document,
            side: this.sideFor(document.uri),
            ready: false,
        };
        this.panes.set(panel, entry);
        this.linkPartner(entry);

        panel.webview.onDidReceiveMessage((message: Command) =>
            this.onMessage(entry, message),
        );
        panel.onDidDispose(() => this.disposePane(entry));

        bootstrapWebview(BPMN_VIEW_TYPE, panel);
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    /**
     * Assigns a diff side to a freshly-resolved URI.
     *
     * `file:` URIs always represent the working tree, i.e. the "after" side.
     * `git:` URIs are the before side in the common working-tree diff
     * (`git: ↔ file:`).  For ref-vs-ref diffs both URIs are `git:`: the one
     * that resolves first gets `"before"` and the second gets `"after"`.
     * Which ref is "really" before in that case is arbitrary — VS Code's
     * diff command decides the visual order and we follow it.
     */
    private sideFor(uri: Uri): DiffSide {
        if (uri.scheme !== "git") {
            return "after";
        }
        for (const existing of this.panes.values()) {
            if (
                existing.document.uri.path === uri.path &&
                existing.side === "before"
            ) {
                return "after";
            }
        }
        return "before";
    }

    /**
     * Links `entry` with any existing unpartnered pane that shares its file
     * path and sits on the opposite diff side.
     */
    private linkPartner(entry: DiffPaneEntry): void {
        for (const candidate of this.panes.values()) {
            if (candidate === entry) {
                continue;
            }
            if (
                candidate.document.uri.path === entry.document.uri.path &&
                candidate.side !== entry.side &&
                candidate.partner === undefined
            ) {
                entry.partner = candidate;
                candidate.partner = entry;
                return;
            }
        }
    }

    private disposePane(entry: DiffPaneEntry): void {
        if (entry.partner) {
            entry.partner.partner = undefined;
        }
        this.panes.delete(entry.panel);
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
        }
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
        const partner = entry.partner;
        if (partner?.ready) {
            const [before, after] =
                entry.side === "before" ? [entry, partner] : [partner, entry];
            await this.computeAndBroadcast(before, after);
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
        for (const entry of this.panes.values()) {
            if (entry.ready) {
                void this.sendLanguage(entry);
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
        const partner = entry.partner;
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
        const partner = entry.partner;
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

    /**
     * Parses both panes' XML, runs `bpmn-js-differ`, and posts a side-targeted
     * {@link ApplyDiffHighlightsQuery} to each webview.  Each side receives
     * only the ids present on its own canvas:
     *   - `_removed` elements exist only on `before`.
     *   - `_added` elements exist only on `after`.
     *   - `_changed` and `_layoutChanged` elements exist on both.
     */
    private async computeAndBroadcast(
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
