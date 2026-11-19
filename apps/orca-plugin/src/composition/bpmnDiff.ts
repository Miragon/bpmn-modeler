import "../../../../packages/bpmn-modeler/src/styles/viewer.css";
import "./orcaDiff.css";

import { computeDiff, type DiffResult, type DiffSide } from "@miragon/bpmn-modeler/diff";
import {
    DiffLegend,
    type DiffLegendContext,
    DiffPaneCoordinator,
    DiffSideLabel,
    DiffViewer,
} from "@miragon/bpmn-modeler/viewer";
import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";
import { applyPageThemeScope } from "@miragon/bpmn-modeler-shared";

import { followOrcaDiff, followOrcaTheme, orcaLanguage } from "../adapter/out/orcaFrame";
import type { DiffSides } from "../port/diffSides";

interface DiffPanes {
    readonly bar: HTMLElement;
    readonly before: HTMLElement;
    readonly after: HTMLElement;
}

/** Shows the tab's change as two read-only diagrams, before on the left, kept in step with Orca. */
export function startBpmnDiff(root: HTMLElement): void {
    i18n.extend(extras);
    i18n.setLanguage(orcaLanguage() as SupportedLocale);
    followOrcaTheme((theme) => applyPageThemeScope("data-bpmn-theme", theme));
    const view = new BpmnDiffView(root);
    followOrcaDiff((sides) => view.show(sides));
}

/** The tab's bar and two panes, showing the latest pair of sides Orca sent. */
class BpmnDiffView {
    private readonly panes: DiffPanes;

    private shown: ShownDiff | undefined;

    constructor(root: HTMLElement) {
        this.panes = BpmnDiffView.mount(root);
    }

    show(sides: DiffSides): void {
        this.shown?.dispose();
        this.shown = new ShownDiff(this.panes, sides);
    }

    private static mount(root: HTMLElement): DiffPanes {
        root.innerHTML = `
            <div class="orca-diff">
                <div class="orca-diff-bar"></div>
                <div class="orca-diff-pane" data-side="before"></div>
                <div class="orca-diff-pane" data-side="after"></div>
            </div>`;
        return {
            bar: root.querySelector<HTMLElement>(".orca-diff-bar")!,
            before: root.querySelector<HTMLElement>('[data-side="before"]')!,
            after: root.querySelector<HTMLElement>('[data-side="after"]')!,
        };
    }
}

/** One pair of sides in the panes: both diagrams, their markers, labels and the bar. */
class ShownDiff {
    private readonly before: DiffViewer;

    private readonly after: DiffViewer;

    private readonly coordinator: DiffPaneCoordinator;

    private readonly labels: Readonly<Record<DiffSide, DiffSideLabel>>;

    private legend: DiffLegend | undefined;

    private disposed = false;

    constructor(
        private readonly panes: DiffPanes,
        sides: DiffSides,
    ) {
        this.before = new DiffViewer(panes.before);
        this.after = new DiffViewer(panes.after);
        // Created before the imports, so both panes take the same first fit.
        this.coordinator = new DiffPaneCoordinator(this.before, this.after);
        this.labels = {
            before: new DiffSideLabel(panes.before, "before"),
            after: new DiffSideLabel(panes.after, "after"),
        };
        this.coordinator.onPlaneMissingChanged((side, missing) =>
            this.labels[side].showPlaneMissing(missing),
        );
        void this.compare(sides);
    }

    dispose(): void {
        this.disposed = true;
        this.legend?.destroy();
        this.labels.before.destroy();
        this.labels.after.destroy();
        this.coordinator.destroy();
        this.before.destroy();
        this.after.destroy();
    }

    private async compare(sides: DiffSides): Promise<void> {
        await Promise.all([
            ShownDiff.importSide(this.before, sides.before),
            ShownDiff.importSide(this.after, sides.after),
        ]);
        if (!sides.before || !sides.after) return;
        const result = await computeDiff(sides.before, sides.after);
        // A newer pair of sides may have replaced this one meanwhile.
        if (!this.disposed) this.markChanges(result);
    }

    private markChanges(result: DiffResult): void {
        this.coordinator.apply(result);
        const shown = { counts: result.counts, canStep: this.coordinator.canStep };
        const legend = new DiffLegend(this.panes.bar, {
            onPrevious: () => this.step(() => this.coordinator.previous(), shown),
            onNext: () => this.step(() => this.coordinator.next(), shown),
            onShowAll: () => {
                this.coordinator.reset();
                legend.update(shown);
            },
        });
        legend.update(shown);
        this.legend = legend;
    }

    private step(move: () => void, shown: DiffLegendContext): void {
        move();
        this.legend?.update({
            ...shown,
            position: { index: this.coordinator.cursor, total: this.coordinator.cycleLength },
        });
    }

    /** An added or deleted file has one empty side, which stays a blank pane. */
    private static async importSide(viewer: DiffViewer, xml: string): Promise<void> {
        if (xml) {
            await viewer.importXML(xml);
        }
    }
}
