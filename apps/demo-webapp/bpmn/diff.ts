import { computeDiff } from "@miragon/bpmn-modeler/diff";
import { DiffLegend, DiffPaneCoordinator, DiffViewer } from "@miragon/bpmn-modeler";

import { DIFF_AFTER_XML, DIFF_BEFORE_XML } from "./diffFixtures";

/**
 * In-page two-pane diff demo (issue #1378) — the in-repo consumer of the public
 * diff surface. No host, no bootstrap, no relayed protocol: two `DiffViewer`s,
 * the Node-safe `computeDiff` data layer fed two XML strings, and a
 * `DiffPaneCoordinator` arming viewport lockstep + a shared stepper. One
 * `DiffLegend` per pane drives prev/next on the shared coordinator.
 *
 * This is the bpm-iq scenario in miniature: two versions in, a `DiffResult` and
 * rendered primitives out. Manual checks: pan/zoom stays in lockstep across
 * panes, and prev/next steps both panes together (including anchoring when a
 * step lands on an added/removed element that exists on only one side).
 */
async function main(): Promise<void> {
    const canvasBefore = document.getElementById("canvas-before");
    const canvasAfter = document.getElementById("canvas-after");
    const paneBefore = document.getElementById("pane-before");
    const paneAfter = document.getElementById("pane-after");
    if (!canvasBefore || !canvasAfter || !paneBefore || !paneAfter) {
        throw new Error("diff demo: missing canvas/pane hosts");
    }

    const before = new DiffViewer(canvasBefore);
    const after = new DiffViewer(canvasAfter);
    await before.importXML(DIFF_BEFORE_XML);
    await after.importXML(DIFF_AFTER_XML);

    const coordinator = new DiffPaneCoordinator(before, after);
    const result = await computeDiff(DIFF_BEFORE_XML, DIFF_AFTER_XML);
    coordinator.apply(result);

    // One legend per pane; both step the same shared cursor. No `onSwap` — the
    // in-page demo has nothing to swap — so the swap button stays hidden.
    for (const [parent, filename] of [
        [paneBefore, "before.bpmn"],
        [paneAfter, "after.bpmn"],
    ] as const) {
        new DiffLegend(parent, {
            onPrevious: () => coordinator.previous(),
            onNext: () => coordinator.next(),
        }).update({ counts: result.counts, filename });
    }
}

void main();
