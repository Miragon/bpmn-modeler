import {
    asProtocolMessage,
    CursorChangedCommand,
    DiffReadyCommand,
    DmnDiffScrollChangedCommand,
    DmnDiffViewChangedCommand,
    GetDmnFileCommand,
    LogErrorCommand,
    type Query,
    SwapCompareSidesCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { DiffSideLabelView } from "@miragon/bpmn-modeler-types";
import type { DmnDiffViewerHandle } from "@miragon/dmn-modeler";

import {
    type DiffPaneEvent,
    type DiffPaneState,
    INITIAL_DIFF_PANE_STATE,
    legendOf,
    missingCardOf,
    type DiffPaneTransition,
    nextDiffPaneState,
    type PaneHighlights,
    type ViewRequest,
} from "../../domain/diffPaneState";
import type { StepTarget } from "../../domain/diffSteps";
import type { DmnDiffPaneHost } from "../../port/dmnHost";
import { DiffEmptyState, DiffLegend } from "./diffLegend";

/**
 * One side of a DMN diff: translates between the host's queries and the
 * read-only {@link DmnDiffViewerHandle}.
 *
 *   - Its file arrives as a `DmnFileQuery`; once imported, the pane reports
 *     {@link DiffReadyCommand}. Highlights that arrive before are held.
 *   - The view the user opens, the DRD's pan and zoom, the table's scroll and
 *     the stepper's cursor go to the host for the partner pane; the partner's
 *     arrive as sync queries and are applied without being posted back.
 *   - A view the partner opens before the import opens once it is done.
 *   - Opening a decision the version lacks shows a card instead of the view.
 */
export class DiffMode {
    private readonly legend: DiffLegend;
    private readonly emptyState: DiffEmptyState;
    private sideLabel?: DiffSideLabelView;
    /** Changes only through {@link nextDiffPaneState}; this class renders it. */
    private state: DiffPaneState = INITIAL_DIFF_PANE_STATE;

    constructor(
        private readonly viewer: DmnDiffViewerHandle,
        private readonly chromeParent: HTMLElement,
        private readonly host: DmnDiffPaneHost,
    ) {
        this.legend = new DiffLegend(chromeParent, {
            onPrevious: () => this.step(-1),
            onNext: () => this.step(1),
            onSwap: () => host.postMessage(new SwapCompareSidesCommand()),
        });
        this.emptyState = new DiffEmptyState(chromeParent, () => void this.openDrdForBoth());
        viewer.onViewChanged((elementId) => {
            this.enterView(elementId, true);
            host.postMessage(new DmnDiffViewChangedCommand(elementId));
        });
        viewer.onViewportChanged((viewport) =>
            host.postMessage(new ViewportChangedCommand(viewport)),
        );
        viewer.onTableScroll((scroll) => host.postMessage(new DmnDiffScrollChangedCommand(scroll)));
    }

    /** Asks the host for the pane's file and starts answering its queries. */
    start(): () => void {
        const listener = (event: MessageEvent<Query>) => void this.handle(event.data);
        window.addEventListener("message", listener);
        this.host.postMessage(new GetDmnFileCommand());
        return () => {
            window.removeEventListener("message", listener);
            this.legend.dispose();
            this.emptyState.dispose();
            this.sideLabel?.destroy();
        };
    }

    async handle(message: Query): Promise<void> {
        const query = asProtocolMessage(message);
        switch (query.type) {
            case "DmnFileQuery":
                await this.importFile(query.content);
                break;
            case "ApplyDmnDiffHighlightsQuery":
                this.dispatch({ kind: "highlighted", highlights: query });
                if (this.state.imported) {
                    this.paint(query);
                    this.renderChrome();
                }
                break;
            case "SyncViewportQuery":
                this.viewer.setViewport(query.viewport);
                break;
            case "SyncDmnDiffViewQuery":
                await this.open(
                    this.dispatch({ kind: "viewRequested", elementId: query.elementId }).viewToOpen,
                );
                break;
            case "SyncDmnDiffScrollQuery":
                this.viewer.setTableScroll(query.scroll);
                break;
            case "SyncCursorQuery": {
                const { target } = this.dispatch({
                    kind: "cursorMoved",
                    index: query.index,
                    direction: 1,
                });
                if (target) this.show(target);
                break;
            }
            case "LanguageQuery":
                await this.viewer.setLocale(query.locale);
                break;
        }
    }

    private async importFile(content: string): Promise<void> {
        if (this.state.imported) return;
        try {
            await this.viewer.importXML(content);
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            this.host.postMessage(
                new LogErrorCommand(`DMN diff import failed: ${failure.message}`, failure.stack),
            );
            return;
        }
        const { viewToOpen } = this.dispatch({
            kind: "imported",
            activeElementId: this.viewer.getActiveElementId(),
        });
        const { highlights } = this.state;
        if (highlights) this.paint(highlights);
        await this.open(viewToOpen);
        this.renderChrome();
        this.host.postMessage(new DiffReadyCommand());
    }

    private paint(highlights: PaneHighlights): void {
        // diff.css draws the divider on the edge that faces the partner pane.
        document.body.dataset.diffSide = highlights.side;
        this.viewer.setMarks(highlights.view, { countBadges: highlights.side === "after" });
        this.label(highlights);
    }

    /** Names the pane's side, or on compare-files panes its file, which the tab title does not tell apart. */
    private label(highlights: PaneHighlights): void {
        this.sideLabel ??= new DiffSideLabelView(this.chromeParent, highlights.side, i18n);
        this.sideLabel.showFilename(
            highlights.origin === "compare-files" ? highlights.paneFilename : undefined,
        );
    }

    private enterView(elementId: string | null, found: boolean): void {
        this.dispatch({ kind: "viewEntered", elementId, found });
        this.viewer.focus(undefined);
        this.renderChrome();
    }

    private async open(request: ViewRequest | undefined): Promise<void> {
        if (!request) return;
        this.enterView(request.elementId, await this.viewer.openView(request.elementId));
    }

    private async openDrdForBoth(): Promise<void> {
        await this.open({ elementId: null });
        this.host.postMessage(new DmnDiffViewChangedCommand(null));
    }

    private renderChrome(): void {
        this.emptyState.show(missingCardOf(this.state));
        const legend = legendOf(this.state, this.viewer.getViewStatus());
        if (legend) this.legend.update(legend);
    }

    /** A step from this pane's legend, which the host forwards to the partner pane. */
    private step(direction: 1 | -1): void {
        const { target } = this.dispatch({ kind: "stepped", direction });
        if (!target) return;
        this.show(target);
        this.host.postMessage(new CursorChangedCommand(this.state.cursor));
    }

    private show(target: StepTarget): void {
        if ("focus" in target) {
            this.viewer.focus(target.focus);
            return;
        }
        this.viewer.focus(undefined);
        if (target.anchor) this.viewer.reveal(target.anchor);
    }

    private dispatch(event: DiffPaneEvent): DiffPaneTransition {
        const transition = nextDiffPaneState(this.state, event);
        this.state = transition.state;
        return transition;
    }
}
