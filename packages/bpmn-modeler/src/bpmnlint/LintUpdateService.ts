import type { LintResults } from "@miragon/bpmn-modeler-types";
import type EventBus from "diagram-js/lib/core/EventBus";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";

import { diffElementIssues, type ElementIssues } from "./lintIssueDiff";
import { LintingInternals } from "./lintingInternals";
import { LintRunScheduler } from "./lintRunScheduler";

// The vendor mirrors a subprocess's overlay onto its drill-down plane under this id.
const PLANE_SUFFIX = "_plane";

interface Bpmnjs {
    getDefinitions(): unknown;
}

// Formatting mutates reports, and the external tier hands out its cached results.
function copyLintResults(results: LintResults): LintResults {
    const copy: LintResults = {};
    for (const [rule, reports] of Object.entries(results)) {
        copy[rule] = reports.map((report) => ({ ...report }));
    }
    return copy;
}

// A drill-down root and its subprocess can both be issue keys, and then share one overlay slot.
function sharesPlaneOverlaySlot(...issueMaps: ElementIssues[]): boolean {
    const elementIds = new Set(issueMaps.flatMap((issues) => Object.keys(issues)));
    return [...elementIds].some((elementId) => elementIds.has(`${elementId}${PLANE_SUFFIX}`));
}

// Replaces the vendor update() so bursts of triggers coalesce into one run and only the
// overlays of elements whose issues changed are redrawn.
export class LintUpdateService {
    static $inject = ["linting", "overlays", "eventBus", "bpmnjs"];

    private readonly linting: LintingInternals;

    private readonly scheduler = new LintRunScheduler((isCurrent) => this.relint(isCurrent));

    constructor(
        linting: unknown,
        private readonly overlays: Overlays,
        eventBus: EventBus,
        private readonly bpmnjs: Bpmnjs,
    ) {
        this.linting = new LintingInternals(linting);
        this.linting.replaceUpdate(() => this.scheduler.request());
        eventBus.on(["diagram.clear", "diagram.destroy"], () => {
            this.scheduler.cancel();
        });
    }

    private async relint(isCurrent: () => boolean): Promise<void> {
        if (!this.bpmnjs.getDefinitions()) {
            return;
        }
        const results = await this.linting.lint();
        if (!isCurrent()) {
            return;
        }
        const issues = this.linting.formatIssues(copyLintResults(results));
        if (!this.linting.isActive()) {
            this.linting.clearOverlays();
        } else if (sharesPlaneOverlaySlot(this.linting.renderedIssues(), issues)) {
            this.redrawAllElements(issues);
        } else {
            this.redrawChangedElements(issues);
        }
        this.linting.storeIssues(issues);
        this.linting.updateButton();
        this.linting.fireComplete(issues);
    }

    private redrawAllElements(issues: ElementIssues): void {
        this.linting.clearOverlays();
        for (const [elementId, elementIssues] of Object.entries(issues)) {
            this.linting.createElementOverlays(elementId, elementIssues);
        }
    }

    private redrawChangedElements(issues: ElementIssues): void {
        const { staleElementIds, freshElementIds } = diffElementIssues(
            this.linting.renderedIssues(),
            issues,
            (elementId) => this.isRendered(elementId),
        );
        for (const elementId of staleElementIds) {
            this.removeOverlay(elementId);
            this.removeOverlay(`${elementId}${PLANE_SUFFIX}`);
        }
        for (const elementId of freshElementIds) {
            this.linting.createElementOverlays(elementId, issues[elementId]);
        }
    }

    private isRendered(elementId: string): boolean {
        const planeOverlayId = this.linting.overlayIdOf(`${elementId}${PLANE_SUFFIX}`);
        return (
            this.isLive(this.linting.overlayIdOf(elementId)) &&
            (planeOverlayId === undefined || this.isLive(planeOverlayId))
        );
    }

    private isLive(overlayId: string | undefined): boolean {
        return overlayId !== undefined && this.overlays.get(overlayId) != null;
    }

    private removeOverlay(overlayKey: string): void {
        const overlayId = this.linting.overlayIdOf(overlayKey);
        if (overlayId === undefined) {
            return;
        }
        this.overlays.remove(overlayId);
        this.linting.forgetOverlayId(overlayKey);
    }
}
