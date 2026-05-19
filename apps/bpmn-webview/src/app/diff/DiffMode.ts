import {
    ApplyDiffHighlightsQuery,
    Command,
    CursorChangedCommand,
    DiffReadyCommand,
    Query,
    SwapCompareSidesCommand,
    SyncCursorQuery,
    SyncViewportQuery,
    VsCodeApi,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";

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
 *   - Incoming {@link ApplyDiffHighlightsQuery} → paint markers, show legend
 *     on both panes (counts + navigationOrder are symmetric across sides).
 *   - Incoming {@link SyncViewportQuery} → apply partner's viewport.
 *   - Incoming {@link SyncCursorQuery} → advance local stepper without
 *     re-emitting (would otherwise ping-pong the two panes forever).
 *   - Outgoing {@link ViewportChangedCommand} on user pan/zoom.
 *   - Outgoing {@link CursorChangedCommand} on user-driven Next/Prev so the
 *     partner pane's stepper stays in lockstep.
 *
 * Nav buttons cycle a shared cursor over `navigationOrder`; both panes drive
 * focus locally so changed/layoutChanged elements glow on both sides.
 * Added/removed ids exist on only one pane; the other anchors via
 * {@link findAnchor} and follows via the viewport-sync channel.
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
            onPrevious: () => this.step(-1),
            onNext: () => this.step(1),
            // The button is only visible on compare-files panes (the legend
            // toggles its display based on origin), so the host side will only
            // ever receive this command from a compare-files session.  The
            // host still validates origin defensively before acting.
            onSwap: () => this.vscode.postMessage(new SwapCompareSidesCommand()),
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

    private async onMessage(message: MessageType): Promise<void> {
        switch (message.type) {
            case "ApplyDiffHighlightsQuery":
                this.paint(message as ApplyDiffHighlightsQuery);
                break;
            case "SyncViewportQuery":
                this.viewer.setViewport((message as SyncViewportQuery).viewport);
                break;
            case "SyncCursorQuery":
                this.applyCursor((message as SyncCursorQuery).index, false);
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
        // Tag the body so diff.css can render a divider on the edge facing the
        // partner pane — the two borders meet at VS Code's sash, giving the
        // user a visible hint of where to drag to resize the split.
        document.body.dataset.diffSide = query.side;

        this.viewer.clearHighlights();
        this.viewer.applyHighlights(query.added, "diff-added");
        this.viewer.applyHighlights(query.removed, "diff-removed");
        this.viewer.applyHighlights(query.changed, "diff-changed");
        this.viewer.applyHighlights(query.layoutChanged, "diff-layout-changed");

        // Skip connections whose *only* change is `layoutChanged` — that
        // happens when a task moves and its incoming/outgoing flows get new
        // waypoints as a side-effect.  The flow carries no semantic change
        // on its own, and the user already sees it highlighted when the
        // attached shape comes up in the cycle.
        const semanticIds = new Set<string>([...query.removed, ...query.added, ...query.changed]);
        const isLayoutOnlyConnection = (id: string): boolean =>
            !semanticIds.has(id) &&
            query.layoutChanged.includes(id) &&
            this.viewer.isConnection(id);

        // Use the host-provided sequence-flow order so the stepper walks
        // start event → end event instead of in differ insertion order.
        this.changeIds.length = 0;
        for (const id of query.navigationOrder) {
            if (!isLayoutOnlyConnection(id)) {
                this.changeIds.push(id);
            }
        }
        this.cursor = -1;

        // Both panes render the legend now: counts are symmetric across
        // sides, and each pane drives a synced cursor over the same
        // navigationOrder array, so the user can step from either side.
        // The origin/filename fields drive origin-specific affordances
        // inside DiffLegend (filename subtitle, swap button).
        this.legend.update({
            counts: query.counts,
            origin: query.origin,
            filename: query.paneFilename,
        });
    }

    /**
     * User-driven step from this pane's Next/Prev buttons.  Computes the new
     * cursor, applies it locally, and posts {@link CursorChangedCommand} so
     * the host can fan it to the partner pane via {@link SyncCursorQuery}.
     */
    private step(direction: 1 | -1): void {
        if (this.changeIds.length === 0) {
            return;
        }
        const next = (this.cursor + direction + this.changeIds.length) % this.changeIds.length;
        this.applyCursor(next, true, direction);
    }

    /**
     * Moves the local stepper to `index` and either focuses (id exists on
     * this canvas) or anchors on a surviving neighbour (id is partner-only).
     * Posts {@link CursorChangedCommand} when `emit` is true — set to false
     * for incoming {@link SyncCursorQuery} to avoid a ping-pong loop.
     *
     * `direction` biases the anchor walk towards the user's step direction
     * when invoked from {@link step}; an incoming sync defaults to forward
     * search since the partner already chose the canonical direction.
     */
    private applyCursor(index: number, emit: boolean, direction: 1 | -1 = 1): void {
        if (this.changeIds.length === 0) {
            return;
        }
        this.cursor = index;
        const targetId = this.changeIds[this.cursor];

        if (!this.viewer.focusElement(targetId)) {
            // Target id lives only on the partner pane.  Centre on the
            // nearest neighbour in `changeIds` that exists on this canvas —
            // the viewbox move then propagates via viewport-sync so the
            // partner pane brings the actual element into view with its
            // diff highlight.  Without this anchoring the stepper appears
            // frozen whenever the cursor lands on a partner-only id.
            const anchor = this.findAnchor(this.cursor, direction);
            if (anchor !== undefined) {
                this.viewer.centerOnElement(anchor);
            }
            this.viewer.clearSelectionMarker();
        }

        if (emit) {
            this.vscode.postMessage(new CursorChangedCommand(this.cursor));
        }
    }

    /**
     * Walks outward from `cursor` in `changeIds`, preferring `direction`, to
     * locate an id that is present on this pane.  Returns `undefined` only
     * in the degenerate case where every id in the cycle lives exclusively
     * on the partner pane.
     */
    private findAnchor(cursor: number, direction: 1 | -1): string | undefined {
        const len = this.changeIds.length;
        for (let i = 1; i < len; i++) {
            for (const dir of [direction, -direction] as const) {
                const idx = (((cursor + dir * i) % len) + len) % len;
                const id = this.changeIds[idx];
                if (this.viewer.hasElement(id)) {
                    return id;
                }
            }
        }
        return undefined;
    }
}
