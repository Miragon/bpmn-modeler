import "../../../../packages/bpmn-modeler/src/styles/viewer.css";
import "./orcaDiff.css";

import { computeDiff, type DiffResult } from "@miragon/bpmn-modeler/diff";
import { DiffLegend, DiffPaneCoordinator, DiffViewer } from "@miragon/bpmn-modeler/viewer";
import { i18n, type SupportedLocale } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";
import { applyPageThemeScope } from "@miragon/bpmn-modeler-shared";

import { followOrcaDiff, followOrcaTheme, orcaLanguage } from "../adapter/out/orcaFrame";
import type { DiffSides } from "../port/diffSides";

interface DiffPanes {
    readonly before: HTMLElement;
    readonly after: HTMLElement;
}

/** Shows the tab's change as two read-only diagrams, before on the left, kept in step with Orca. */
export function startBpmnDiff(root: HTMLElement): void {
    i18n.extend(extras);
    i18n.setLanguage(orcaLanguage() as SupportedLocale);
    followOrcaTheme((theme) => applyPageThemeScope("data-bpmn-theme", theme));
    const panes = mountDiffPanes(root);
    let latest = 0;
    let disposeShown = (): void => undefined;
    followOrcaDiff((sides) => {
        const run = ++latest;
        disposeShown();
        const shown = showDiff(panes, sides, () => run === latest);
        disposeShown = shown.dispose;
    });
}

function mountDiffPanes(root: HTMLElement): DiffPanes {
    root.innerHTML = `
        <div class="orca-diff">
            <div class="orca-diff-pane" data-side="before"></div>
            <div class="orca-diff-pane" data-side="after"></div>
        </div>`;
    return {
        before: root.querySelector<HTMLElement>('[data-side="before"]')!,
        after: root.querySelector<HTMLElement>('[data-side="after"]')!,
    };
}

function showDiff(
    panes: DiffPanes,
    sides: DiffSides,
    isCurrent: () => boolean,
): { dispose(): void } {
    const before = new DiffViewer(panes.before);
    const after = new DiffViewer(panes.after);
    // Created before the imports, so both panes take the same first fit.
    const coordinator = new DiffPaneCoordinator(before, after);
    let legend: DiffLegend | null = null;
    void Promise.all([importSide(before, sides.before), importSide(after, sides.after)])
        .then(() => (sides.before && sides.after ? computeDiff(sides.before, sides.after) : null))
        .then((result) => {
            if (result && isCurrent()) {
                legend = markChanges(panes, coordinator, result);
            }
        });
    return {
        dispose() {
            legend?.destroy();
            coordinator.destroy();
            before.destroy();
            after.destroy();
        },
    };
}

function markChanges(
    panes: DiffPanes,
    coordinator: DiffPaneCoordinator,
    result: DiffResult,
): DiffLegend {
    coordinator.apply(result);
    const legend = new DiffLegend(panes.after, {
        onPrevious: () => coordinator.previous(),
        onNext: () => coordinator.next(),
    });
    legend.update({ counts: result.counts, canStep: coordinator.canStep });
    return legend;
}

/** An added or deleted file has one empty side, which stays a blank pane. */
async function importSide(viewer: DiffViewer, xml: string): Promise<void> {
    if (xml) {
        await viewer.importXML(xml);
    }
}
