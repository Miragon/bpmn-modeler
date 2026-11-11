import {
    ApplyDmnDiffHighlightsQuery,
    asProtocolMessage,
    CursorChangedCommand,
    DiffReadyCommand,
    DmnDiffScrollChangedCommand,
    DmnDiffViewChangedCommand,
    type DmnDiffView,
    GetDmnFileCommand,
    LogErrorCommand,
    type Query,
    SwapCompareSidesCommand,
    ViewportChangedCommand,
} from "@miragon/bpmn-modeler-shared";
import { type DiffSide, stepCursor } from "@miragon/bpmn-modeler-types";
import type { DmnDiffViewerHandle } from "@miragon/dmn-modeler";

import { countsOf, presentIn, statusOf, stepsOf, targetAt } from "../../domain/diffSteps";
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
 *   - Opening a decision the version lacks shows a card instead of the view.
 */
export class DiffMode {
    private readonly legend: DiffLegend;
    private readonly emptyState: DiffEmptyState;
    private side: DiffSide = "after";
    private highlights?: ApplyDmnDiffHighlightsQuery;
    private openElement: string | null = null;
    private missing = false;
    private cursor = -1;
    private imported = false;

    constructor(
        private readonly viewer: DmnDiffViewerHandle,
        chromeParent: HTMLElement,
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
        };
    }

    async handle(message: Query): Promise<void> {
        const query = asProtocolMessage(message);
        switch (query.type) {
            case "DmnFileQuery":
                await this.importFile(query.content);
                break;
            case "ApplyDmnDiffHighlightsQuery":
                this.highlights = query;
                if (this.imported) this.paint();
                break;
            case "SyncViewportQuery":
                this.viewer.setViewport(query.viewport);
                break;
            case "SyncDmnDiffViewQuery":
                this.enterView(query.elementId, await this.viewer.openView(query.elementId));
                break;
            case "SyncDmnDiffScrollQuery":
                this.viewer.setTableScroll(query.scroll);
                break;
            case "SyncCursorQuery":
                this.applyCursor(query.index, 1);
                break;
            case "LanguageQuery":
                await this.viewer.setLocale(query.locale);
                break;
        }
    }

    private async importFile(content: string): Promise<void> {
        if (this.imported) return;
        try {
            await this.viewer.importXML(content);
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            this.host.postMessage(
                new LogErrorCommand(`DMN diff import failed: ${failure.message}`, failure.stack),
            );
            return;
        }
        this.imported = true;
        this.openElement = this.viewer.getActiveElementId();
        if (this.highlights) this.paint();
        this.host.postMessage(new DiffReadyCommand());
    }

    private paint(): void {
        const query = this.highlights;
        if (!query) return;
        this.side = query.side;
        // diff.css draws the divider on the edge that faces the partner pane.
        document.body.dataset.diffSide = query.side;
        this.viewer.setMarks(query.view, { countBadges: query.side === "after" });
        this.cursor = -1;
        this.renderLegend();
    }

    private enterView(elementId: string | null, found: boolean): void {
        this.openElement = elementId;
        this.missing = !found;
        this.cursor = -1;
        this.viewer.focus(undefined);
        this.emptyState.show(found ? undefined : this.side);
        this.renderLegend();
    }

    private async openDrdForBoth(): Promise<void> {
        this.enterView(null, await this.viewer.openView(null));
        this.host.postMessage(new DmnDiffViewChangedCommand(null));
    }

    private renderLegend(): void {
        const view = this.view();
        if (!view) return;
        const element = this.openElement;
        const origin = this.highlights?.origin;
        const isCompareFiles = origin === "compare-files";
        this.legend.update({
            counts: this.missing ? undefined : countsOf(view, element),
            status:
                element === null
                    ? undefined
                    : this.missing
                      ? this.side === "after"
                          ? "removed"
                          : "added"
                      : statusOf(view, element),
            filename: isCompareFiles ? this.highlights?.paneFilename : undefined,
            showSwap: isCompareFiles,
            canStep: !this.missing && stepsOf(view, element).length > 0,
        });
    }

    /** A step from this pane's legend, which the host forwards to the partner pane. */
    private step(direction: 1 | -1): void {
        const view = this.view();
        if (!view || this.missing) return;
        const steps = stepsOf(view, this.openElement);
        if (steps.length === 0) return;
        this.applyCursor(stepCursor(this.cursor, direction, steps.length), direction);
        this.host.postMessage(new CursorChangedCommand(this.cursor));
    }

    private applyCursor(index: number, direction: 1 | -1): void {
        const view = this.view();
        if (!view || this.missing) return;
        const steps = stepsOf(view, this.openElement);
        if (index < 0 || index >= steps.length) return;
        this.cursor = index;
        const target = targetAt(steps, presentIn(view, this.openElement), index, direction);
        if ("focus" in target) {
            this.viewer.focus(target.focus);
            return;
        }
        this.viewer.focus(undefined);
        if (target.anchor) this.viewer.reveal(target.anchor);
    }

    private view(): DmnDiffView | undefined {
        return this.highlights?.view;
    }
}
