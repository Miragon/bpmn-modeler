import {
    ApplyDiffHighlightsQuery,
    Command,
    DiffReadyCommand,
    Query,
    SyncViewportQuery,
    VsCodeApi,
    ViewportChangedCommand,
} from "@bpmn-modeler/shared";

import { WebviewState } from "../vscode";
import { DiffLegend } from "./DiffLegend";
import { DiffViewer } from "./DiffViewer";

type MessageType = Query | Command;

/**
 * Entry point for a webview running as one side of a BPMN diff view.
 *
 * Replaces the full modeler stack with a single {@link DiffViewer} + a
 * {@link DiffLegend} chip.  Handles the viewer-mode message protocol:
 *   - Initial XML handed in by {@link startWith} → import, emit {@link DiffReadyCommand}.
 *   - Incoming {@link ApplyDiffHighlightsQuery} → paint markers, show legend.
 *   - Incoming {@link SyncViewportQuery} → apply partner's viewport.
 *   - Outgoing {@link ViewportChangedCommand} on user pan/zoom.
 *
 * Nav buttons cycle a local cursor over the side's own changed-element ids;
 * the partner pane stays in sync via the normal viewport-sync channel.
 */
export class DiffMode {
    private readonly viewer: DiffViewer;

    private readonly legend: DiffLegend;

    /**
     * Ordered ids this pane can navigate to.  Populated from
     * {@link ApplyDiffHighlightsQuery}.  For the `before` side this excludes
     * added elements (they don't exist here); for `after` it excludes removed.
     */
    private readonly changeIds: string[] = [];

    private cursor = -1;

    constructor(
        canvasSelector: string,
        legendParent: HTMLElement,
        private readonly vscode: VsCodeApi<WebviewState, MessageType>,
    ) {
        this.viewer = new DiffViewer(canvasSelector);
        this.legend = new DiffLegend(legendParent, {
            onPrevious: () => this.navigate(-1),
            onNext: () => this.navigate(1),
        });

        this.viewer.onViewportChanged((viewport) => {
            this.vscode.postMessage(new ViewportChangedCommand(viewport));
        });
    }

    /**
     * Entry point.  Accepts the initial XML content the caller already
     * received from the host (main.ts peeks at the first
     * {@link BpmnFileQuery} to decide between modeler and viewer mode, so
     * by the time we get here the XML is in hand — no need to re-request).
     */
    async startWith(initialContent: string): Promise<void> {
        window.addEventListener("message", (event: MessageEvent<MessageType>) => {
            void this.onMessage(event.data);
        });
        await this.loadInitial(initialContent);
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private async onMessage(message: MessageType): Promise<void> {
        switch (message.type) {
            case "ApplyDiffHighlightsQuery":
                this.paint(message as ApplyDiffHighlightsQuery);
                break;
            case "SyncViewportQuery":
                this.viewer.setViewport((message as SyncViewportQuery).viewport);
                break;
        }
    }

    private async loadInitial(content: string): Promise<void> {
        try {
            await this.viewer.importXML(content);
        } catch (error) {
            console.error("DiffViewer import failed", error);
            return;
        }
        this.vscode.postMessage(new DiffReadyCommand());
    }

    private paint(query: ApplyDiffHighlightsQuery): void {
        this.viewer.clearHighlights();
        this.viewer.applyHighlights(query.added, "diff-added");
        this.viewer.applyHighlights(query.removed, "diff-removed");
        this.viewer.applyHighlights(query.changed, "diff-changed");
        this.viewer.applyHighlights(query.layoutChanged, "diff-layout-changed");

        // Rebuild nav order: removed (before only) / added (after only) first,
        // then changed, then layoutChanged.  Stable order lets the two panes
        // iterate in lockstep when the user clicks Next on either side.
        //
        // Skip connections whose *only* change is `layoutChanged` — that
        // happens when a task moves and its incoming/outgoing flows get new
        // waypoints as a side-effect.  The flow carries no semantic change
        // on its own, and the user already sees it highlighted when the
        // attached shape comes up in the cycle.
        //
        // Deduplicate: an edge whose source/target genuinely changes appears
        // in both `changed` and `layoutChanged`, but should land in the
        // cycle only once.
        const semanticIds = new Set<string>([
            ...query.removed,
            ...query.added,
            ...query.changed,
        ]);
        const layoutForNav = query.layoutChanged.filter(
            (id) => semanticIds.has(id) || !this.viewer.isConnection(id),
        );

        this.changeIds.length = 0;
        const seen = new Set<string>();
        for (const id of [
            ...query.removed,
            ...query.added,
            ...query.changed,
            ...layoutForNav,
        ]) {
            if (!seen.has(id)) {
                seen.add(id);
                this.changeIds.push(id);
            }
        }
        this.cursor = -1;

        // Legend (counts + stepper) lives on the "after" pane only.  The
        // counts are symmetric so rendering them twice is redundant, and
        // stepping from the after pane already syncs the before pane via
        // the viewport channel.
        if (query.side === "after") {
            this.legend.update(query.counts);
        }
    }

    private navigate(step: 1 | -1): void {
        if (this.changeIds.length === 0) {
            return;
        }
        this.cursor =
            (this.cursor + step + this.changeIds.length) % this.changeIds.length;
        this.viewer.focusElement(this.changeIds[this.cursor]);
    }
}
