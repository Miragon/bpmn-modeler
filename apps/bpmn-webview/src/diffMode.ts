import {
    ApplyDiffHighlightsQuery,
    Command,
    CursorChangedCommand,
    DiffReadyCommand,
    LogErrorCommand,
    Query,
    SwapCompareSidesCommand,
    SyncCursorQuery,
    SyncViewportQuery,
    HostApi,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";

import { DiffLegend, DiffNavigator, DiffViewer } from "@miragon/bpmn-modeler/viewer";
import type { WebviewState } from "./webviewState";

type MessageType = Query | Command;

/**
 * Entry point for a webview running as one side of a BPMN diff view.
 *
 * Thin host-protocol adapter over the package's diff primitives: it owns a
 * {@link DiffViewer}, a {@link DiffLegend}, and a {@link DiffNavigator}, and
 * translates between them and the Query/Command protocol:
 *   - Initial XML handed in by {@link startWith} → import, emit {@link DiffReadyCommand}.
 *   - Incoming {@link ApplyDiffHighlightsQuery} → paint markers, rebuild the
 *     navigator's cycle, show the legend (counts + navigationOrder are
 *     symmetric across sides).
 *   - Incoming {@link SyncViewportQuery} → apply partner's viewport.
 *   - Incoming {@link SyncCursorQuery} → advance the local navigator without
 *     re-emitting (would otherwise ping-pong the two panes forever).
 *   - Outgoing {@link ViewportChangedCommand} on user pan/zoom.
 *   - Outgoing {@link CursorChangedCommand} on user-driven Next/Prev so the
 *     partner pane's stepper stays in lockstep.
 *
 * The stepper, anchor walk, and layout-only-connection filter all live in
 * {@link DiffNavigator}; this class keeps only the protocol wiring and the
 * origin→legend-props mapping (a VS Code presentation concern).
 */
export class DiffMode {
    private readonly viewer: DiffViewer;

    private readonly legend: DiffLegend;

    private readonly navigator: DiffNavigator;

    constructor(
        canvas: HTMLElement,
        legendParent: HTMLElement,
        private readonly host: HostApi<WebviewState, MessageType>,
    ) {
        this.viewer = new DiffViewer(canvas);
        this.navigator = new DiffNavigator(this.viewer);
        this.legend = new DiffLegend(legendParent, {
            onPrevious: () => this.step(-1),
            onNext: () => this.step(1),
            // Always wired; the legend hides the button unless the update's
            // `showSwap` is set (compare-files only).  The host still validates
            // origin defensively before acting on the command.
            onSwap: () => this.host.postMessage(new SwapCompareSidesCommand()),
        });

        this.viewer.onViewportChanged((viewport) => {
            this.host.postMessage(new ViewportChangedCommand(viewport));
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
                this.navigator.applyCursor((message as SyncCursorQuery).index);
                break;
        }
    }

    private async loadInitial(content: string): Promise<void> {
        try {
            await this.viewer.importXML(content);
        } catch (error) {
            console.error("DiffViewer import failed", error);
            const e = error instanceof Error ? error : new Error(String(error));
            this.host.postMessage(
                new LogErrorCommand(`DiffViewer import failed: ${e.message}`, e.stack),
            );
            return;
        }
        this.host.postMessage(new DiffReadyCommand());
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

        this.navigator.setChanges(
            {
                added: query.added,
                removed: query.removed,
                changed: query.changed,
                layoutChanged: query.layoutChanged,
            },
            query.navigationOrder,
        );

        // Both panes render the legend now: counts are symmetric across sides,
        // and each pane drives a synced cursor over the same navigationOrder, so
        // the user can step from either side.  The filename subtitle and swap
        // button are compare-files affordances — SCM panes show neither because
        // VS Code's tab title already carries that metadata.
        const isCompareFiles = query.origin === "compare-files";
        this.legend.update({
            counts: query.counts,
            filename: isCompareFiles ? query.paneFilename : undefined,
            showSwap: isCompareFiles,
        });
    }

    /**
     * User-driven step from this pane's Next/Prev buttons.  Advances the local
     * navigator, then posts {@link CursorChangedCommand} so the host can fan it
     * to the partner pane via {@link SyncCursorQuery}.
     */
    private step(direction: 1 | -1): void {
        const cursor = this.navigator.advance(direction);
        if (cursor !== undefined) {
            this.host.postMessage(new CursorChangedCommand(cursor));
        }
    }
}
