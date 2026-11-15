import {
    ApplyDiffHighlightsQuery,
    CursorChangedCommand,
    type ProtocolMessage,
    SHOW_ALL_CURSOR,
    SwapCompareSidesCommand,
    SwitchMergeComparisonCommand,
} from "@miragon/bpmn-modeler-shared";
import {
    DIFF_CATEGORIES,
    DIFF_MARKERS,
    type DiffLegendState,
    DiffLegendView,
    diffOriginSupports,
} from "@miragon/bpmn-modeler-types";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import { DiffNavigator } from "@miragon/bpmn-modeler/viewer";

import { diffPaneLabel } from "../../domain/diffPaneLabel";
import { comparisonPaneText, type MergeTranslate } from "../../domain/mergeTexts";
import type { DiffPaneChannel } from "../../port/hostChannel";
import { DiffPanePlumbing } from "./diffPanePlumbing";
import { ResultComparisonSwitch } from "./resultComparisonSwitch";

const translate: MergeTranslate = (key, replacements) => i18n.translate(key, replacements);

/**
 * Entry point for a webview running as one side of a BPMN diff view.
 *
 * Thin host-protocol adapter over the package's diff primitives: on top of the
 * {@link DiffPanePlumbing} every two-pane view shares, it owns a
 * {@link DiffLegendView} and a {@link DiffNavigator}, and translates between
 * them and the Query/Command protocol:
 *   - Incoming {@link ApplyDiffHighlightsQuery} → paint markers, rebuild the
 *     navigator's cycle, show the legend (counts + navigationOrder are
 *     symmetric across sides).
 *   - Incoming {@link SyncCursorQuery} → advance the local navigator without
 *     re-emitting (would otherwise ping-pong the two panes forever).
 *   - Outgoing {@link CursorChangedCommand} on user-driven Next/Prev so the
 *     partner pane's stepper stays in lockstep.
 *   - On a built merge result compared with one side, the bar names the side
 *     and posts {@link SwitchMergeComparisonCommand} from its switch, which
 *     it shows only where the query's `comparison` offers it.
 *
 * The stepper and anchor walk live in {@link DiffNavigator}; the host's
 * navigationOrder already leaves out connections whose only change is layout.
 * This class keeps only the protocol wiring and the origin→legend-props
 * mapping (a VS Code presentation concern).
 */
export class DiffMode {
    private readonly pane: DiffPanePlumbing;

    private readonly legend: DiffLegendView;

    private readonly comparison: ResultComparisonSwitch;

    private readonly navigator: DiffNavigator;

    private legendContext: DiffLegendState | undefined;

    constructor(
        canvas: HTMLElement,
        legendParent: HTMLElement,
        private readonly host: DiffPaneChannel,
    ) {
        this.pane = new DiffPanePlumbing(canvas, host);
        this.navigator = new DiffNavigator(this.pane.viewer);
        this.legend = new DiffLegendView(
            legendParent,
            {
                onPrevious: () => this.step(-1),
                onNext: () => this.step(1),
                // Always wired; the legend hides the button unless the update's
                // `showSwap` is set (compare-files only).  The host still validates
                // origin defensively before acting on the command.
                onSwap: () => this.host.postMessage(new SwapCompareSidesCommand()),
                onShowAll: () => this.showAll(),
            },
            i18n,
        );
        this.comparison = new ResultComparisonSwitch(
            this.legend.extensionElement(),
            () => this.host.postMessage(new SwitchMergeComparisonCommand()),
            translate,
        );
        i18n.onChange(() => this.comparison.render());

        // diff.css starts the canvas below the bar.
        this.legend.reserveRoomOn(document.body);
    }

    /**
     * Entry point.  Accepts the initial XML content the caller already
     * received from the host (main.ts peeks at the first
     * {@link BpmnFileQuery} to decide between modeler and viewer mode, so
     * by the time we get here the XML is in hand — no need to re-request).
     */
    async startWith(initialContent: string): Promise<void> {
        await this.pane.start(initialContent, (query) => this.onMessage(query));
    }

    private onMessage(query: ProtocolMessage): void {
        switch (query.type) {
            case "ApplyDiffHighlightsQuery":
                this.pane.whenImported(() => this.paint(query));
                break;
            case "SyncCursorQuery":
                if (query.index === SHOW_ALL_CURSOR) {
                    this.backToWholeDiagram();
                } else {
                    this.pane.setPlaneMissing(false);
                    this.navigator.applyCursor(query.index);
                    this.showPosition(query.index);
                }
                break;
        }
    }

    private paint(query: ApplyDiffHighlightsQuery): void {
        this.pane.tagSide(query.side);
        this.pane.offerElementXmlChanges(query.elementXmlChanges);

        const viewer = this.pane.viewer;
        viewer.clearHighlights();
        for (const category of DIFF_CATEGORIES) {
            viewer.applyHighlights(query[category], DIFF_MARKERS[category]);
        }

        this.navigator.setChanges(query.navigationOrder);
        const { comparison } = query;
        this.pane.label(query.side, () =>
            comparison
                ? comparisonPaneText(query.side, comparison.against, translate)
                : diffPaneLabel(query),
        );
        this.updateLegend(query);
    }

    /**
     * Both panes draw the bar, so the two halves read as one across VS Code's
     * sash; the after pane's half carries the changes, stepping and swapping.
     */
    private updateLegend(query: ApplyDiffHighlightsQuery): void {
        const isAfter = query.side === "after";
        this.legendContext = {
            counts: query.counts,
            showSwap: isAfter && diffOriginSupports(query.origin, "swapsSides"),
            canStep: this.navigator.canStep,
            showChanges: isAfter,
        };
        this.legend.update(this.legendContext);
        this.comparison.update(isAfter ? query.comparison : undefined);
    }

    /** Show all: both panes go back to the whole diagram, the partner through the host. */
    private showAll(): void {
        this.backToWholeDiagram();
        this.host.postMessage(new CursorChangedCommand(SHOW_ALL_CURSOR));
    }

    private backToWholeDiagram(): void {
        this.navigator.reset();
        this.pane.setPlaneMissing(false);
        if (this.legendContext) {
            this.legend.update(this.legendContext);
        }
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
            this.pane.setPlaneMissing(false);
            this.showPosition(cursor);
            this.host.postMessage(new CursorChangedCommand(cursor));
        }
    }
}
