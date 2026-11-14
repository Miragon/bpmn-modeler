import {
    ApplyDiffHighlightsQuery,
    asProtocolMessage,
    CursorChangedCommand,
    DiffPlaneChangedCommand,
    DiffReadyCommand,
    DiffSelectionChangedCommand,
    LogErrorCommand,
    NO_DIFF_SELECTION,
    Query,
    SHOW_ALL_CURSOR,
    ShowElementXmlChangesCommand,
    SwapCompareSidesCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { DIFF_CATEGORIES, DIFF_MARKERS } from "@miragon/bpmn-modeler-types";

import {
    DiffLegend,
    type DiffLegendContext,
    DiffNavigator,
    DiffSideLabel,
    DiffViewer,
} from "@miragon/bpmn-modeler/viewer";
import type { DiffPaneChannel } from "../../port/hostChannel";
import { createElementXmlChangesModule } from "./elementXmlContextPad";

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
 *   - Incoming {@link SyncDiffSelectionQuery} → mirror the partner's selection
 *     without re-emitting, for the same reason.
 *   - Outgoing {@link ViewportChangedCommand} on user pan/zoom.
 *   - Outgoing {@link CursorChangedCommand} on user-driven Next/Prev so the
 *     partner pane's stepper stays in lockstep.
 *   - Outgoing {@link DiffSelectionChangedCommand} on every user selection, and
 *     {@link ShowElementXmlChangesCommand} from the context pad's entry.
 *
 * The stepper and anchor walk live in {@link DiffNavigator}; the host's
 * navigationOrder already leaves out connections whose only change is layout.
 * This class keeps only the protocol wiring and the origin→legend-props
 * mapping (a VS Code presentation concern).
 */
export class DiffMode {
    private readonly viewer: DiffViewer;

    private readonly legend: DiffLegend;

    private readonly navigator: DiffNavigator;

    private sideLabel: DiffSideLabel | undefined;

    private legendContext: DiffLegendContext | undefined;

    // Whether this version lacks the plane the user entered on the partner pane.
    private planeMissing = false;

    private initialImportSettled = false;

    private highlightsBeforeImport: ApplyDiffHighlightsQuery | undefined;

    private hostShowsElementXmlChanges = false;

    constructor(
        private readonly canvas: HTMLElement,
        legendParent: HTMLElement,
        private readonly host: DiffPaneChannel,
    ) {
        this.viewer = new DiffViewer(canvas, {
            additionalModules: [
                createElementXmlChangesModule({
                    canShowElementXmlChanges: () => this.hostShowsElementXmlChanges,
                    showElementXmlChanges: (elementId) =>
                        this.host.postMessage(new ShowElementXmlChangesCommand(elementId)),
                }),
            ],
        });
        this.navigator = new DiffNavigator(this.viewer);
        this.legend = new DiffLegend(legendParent, {
            onPrevious: () => this.step(-1),
            onNext: () => this.step(1),
            // Always wired; the legend hides the button unless the update's
            // `showSwap` is set (compare-files only).  The host still validates
            // origin defensively before acting on the command.
            onSwap: () => this.host.postMessage(new SwapCompareSidesCommand()),
            onShowAll: () => this.showAll(),
        });

        // diff.css starts the canvas below the bar.
        this.legend.reserveRoomOn(document.body);

        this.viewer.onPlaneChanged((planeId) => {
            this.setPlaneMissing(false);
            this.host.postMessage(new DiffPlaneChangedCommand(planeId));
        });

        this.viewer.onViewportChanged((viewport) => {
            // On a plane the partner lacks, its coordinates would mean nothing there.
            if (!this.planeMissing) {
                this.host.postMessage(new ViewportChangedCommand(viewport));
            }
        });
        this.viewer.onSelectedElementChanged((elementId) => {
            this.host.postMessage(new DiffSelectionChangedCommand(elementId ?? NO_DIFF_SELECTION));
        });
    }

    /**
     * Entry point.  Accepts the initial XML content the caller already
     * received from the host (main.ts peeks at the first
     * {@link BpmnFileQuery} to decide between modeler and viewer mode, so
     * by the time we get here the XML is in hand — no need to re-request).
     */
    async startWith(initialContent: string): Promise<void> {
        window.addEventListener("message", (event: MessageEvent<Query>) => {
            void this.onMessage(event.data);
        });
        await this.loadInitial(initialContent);
    }

    private async onMessage(message: Query): Promise<void> {
        const query = asProtocolMessage(message);
        switch (query.type) {
            case "ApplyDiffHighlightsQuery":
                // An empty canvas would drop the markers but keep the legend counts.
                if (this.initialImportSettled) {
                    this.paint(query);
                } else {
                    this.highlightsBeforeImport = query;
                }
                break;
            case "SyncDiffPlaneQuery":
                this.setPlaneMissing(!this.viewer.showPlane(query.planeId));
                break;
            case "SyncViewportQuery":
                if (this.planeMissing) break;
                this.viewer.setViewport(query.viewport);
                break;
            case "SyncCursorQuery":
                if (query.index === SHOW_ALL_CURSOR) {
                    this.backToWholeDiagram();
                } else {
                    this.setPlaneMissing(false);
                    this.navigator.applyCursor(query.index);
                    this.showPosition(query.index);
                }
                break;
            case "SyncDiffSelectionQuery":
                this.viewer.mirrorSelection(
                    query.elementId === NO_DIFF_SELECTION ? undefined : query.elementId,
                );
                break;
        }
    }

    private async loadInitial(content: string): Promise<void> {
        try {
            await this.viewer.importXML(content);
        } catch (error) {
            this.initialImportSettled = true;
            this.highlightsBeforeImport = undefined;
            console.error("DiffViewer import failed", error);
            const e = error instanceof Error ? error : new Error(String(error));
            this.host.postMessage(
                new LogErrorCommand(`DiffViewer import failed: ${e.message}`, e.stack),
            );
            return;
        }
        this.initialImportSettled = true;
        if (this.highlightsBeforeImport) {
            this.paint(this.highlightsBeforeImport);
            this.highlightsBeforeImport = undefined;
        }
        this.host.postMessage(new DiffReadyCommand());
    }

    private paint(query: ApplyDiffHighlightsQuery): void {
        // Tag the body so diff.css can render a divider on the edge facing the
        // partner pane — the two borders meet at VS Code's sash, giving the
        // user a visible hint of where to drag to resize the split.
        document.body.dataset.diffSide = query.side;
        this.hostShowsElementXmlChanges = query.elementXmlChanges;

        this.viewer.clearHighlights();
        for (const category of DIFF_CATEGORIES) {
            this.viewer.applyHighlights(query[category], DIFF_MARKERS[category]);
        }

        this.navigator.setChanges(query.navigationOrder);
        this.label(query);
        this.updateLegend(query);
    }

    /** Names the pane's side, or on compare-files panes its file, which the tab title does not tell apart. */
    private label(query: ApplyDiffHighlightsQuery): void {
        this.sideLabel ??= new DiffSideLabel(this.canvas, query.side);
        this.sideLabel.showFilename(
            query.origin === "compare-files" ? query.paneFilename : undefined,
        );
    }

    /**
     * Both panes draw the bar, so the two halves read as one across VS Code's
     * sash; the after pane's half carries the changes, stepping and swapping.
     */
    private updateLegend(query: ApplyDiffHighlightsQuery): void {
        const isAfter = query.side === "after";
        this.legendContext = {
            counts: query.counts,
            showSwap: isAfter && query.origin === "compare-files",
            canStep: this.navigator.canStep,
            showChanges: isAfter,
        };
        this.legend.update(this.legendContext);
    }

    /** Show all: both panes go back to the whole diagram, the partner through the host. */
    private showAll(): void {
        this.backToWholeDiagram();
        this.host.postMessage(new CursorChangedCommand(SHOW_ALL_CURSOR));
    }

    private backToWholeDiagram(): void {
        this.navigator.reset();
        this.setPlaneMissing(false);
        if (this.legendContext) {
            this.legend.update(this.legendContext);
        }
    }

    private setPlaneMissing(missing: boolean): void {
        this.planeMissing = missing;
        this.sideLabel?.showPlaneMissing(missing);
    }

    private showPosition(index: number): void {
        if (this.legendContext) {
            this.legend.update({
                ...this.legendContext,
                position: { index, total: this.navigator.cycleLength },
            });
        }
    }

    /**
     * User-driven step from this pane's Next/Prev buttons.  Advances the local
     * navigator, then posts {@link CursorChangedCommand} so the host can fan it
     * to the partner pane via {@link SyncCursorQuery}.
     */
    private step(direction: 1 | -1): void {
        const cursor = this.navigator.advance(direction);
        if (cursor !== undefined) {
            this.setPlaneMissing(false);
            this.showPosition(cursor);
            this.host.postMessage(new CursorChangedCommand(cursor));
        }
    }
}
