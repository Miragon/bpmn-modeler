import OverlaysModule from "diagram-js/lib/features/overlays";
import { escapeHTML } from "diagram-js/lib/util/EscapeUtil";
import { MERGE_MARKER_CLASSES, MERGE_MARKERS, type MergeMarker } from "@miragon/bpmn-modeler-types";

import "./mergeMarks.css";

/** How a merge pane reaches the marks its canvas paints, once diagram-js built them. */
export interface MergeMarksConfig {
    attach(marks: MergeMarks): void;
}

interface Canvas {
    addMarker(id: string, marker: string): void;
    removeMarker(id: string, marker: string): void;
    getContainer(): HTMLElement;
}

interface ElementRegistry {
    get(id: string): unknown;
    forEach(visit: (element: { id: string }) => void): void;
}

interface Overlays {
    add(id: string, type: string, overlay: { position: object; html: string }): string;
    remove(filter: { type: string }): void;
}

const CONFLICT_BADGE = "merge-conflict-badge";

// The hatch of "taken from the other side", its non-colour cue; mergeMarks.css fills shapes with it.
const HATCH_PATTERN = `<defs><pattern id="merge-hatch" class="merge-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect class="merge-hatch__ground" width="8" height="8"/><line class="merge-hatch__line" x1="0" y1="0" x2="0" y2="8"/></pattern></defs>`;

/**
 * Paints a merge pane's markers: one class per marker on the elements this
 * canvas holds, plus a cue that is no colour (a "!" badge on a conflict, a
 * hatch on an element taken from the other side, a heavy contour on one
 * taken from this side). Each paint replaces the last one; it decides
 * nothing, the host sent which element gets which marker.
 */
export class MergeMarks {
    static $inject = ["canvas", "elementRegistry", "overlays", "mergeMarksConfig"];

    constructor(
        private readonly canvas: Canvas,
        private readonly registry: ElementRegistry,
        private readonly overlays: Overlays,
        config: MergeMarksConfig,
    ) {
        this.addHatchPattern();
        config.attach(this);
    }

    paint(marks: Readonly<Record<MergeMarker, readonly string[]>>, conflictLabel: string): void {
        this.clear();
        for (const marker of MERGE_MARKERS) {
            // Overlays throw on an id the canvas lacks, and the partner pane may hold it alone.
            for (const id of marks[marker].filter((candidate) => this.registry.get(candidate))) {
                this.canvas.addMarker(id, MERGE_MARKER_CLASSES[marker]);
                if (marker === "conflict") this.addConflictBadge(id, conflictLabel);
            }
        }
    }

    private clear(): void {
        this.overlays.remove({ type: CONFLICT_BADGE });
        this.registry.forEach(({ id }) => {
            for (const marker of MERGE_MARKERS) {
                this.canvas.removeMarker(id, MERGE_MARKER_CLASSES[marker]);
            }
        });
    }

    private addConflictBadge(id: string, label: string): void {
        const name = escapeHTML(label);
        this.overlays.add(id, CONFLICT_BADGE, {
            position: { top: -10, right: 10 },
            html: `<div class="${CONFLICT_BADGE}" role="img" aria-label="${name}" title="${name}">!</div>`,
        });
    }

    private addHatchPattern(): void {
        const svg = this.canvas.getContainer().querySelector("svg");
        if (svg && !svg.querySelector("#merge-hatch")) {
            svg.insertAdjacentHTML("afterbegin", HATCH_PATTERN);
        }
    }
}

/** The merge pane's marks, which hand themselves to `config` once the pane's canvas exists. */
export function createMergeMarksModule(config: MergeMarksConfig) {
    return {
        __depends__: [OverlaysModule],
        __init__: ["mergeMarks"],
        mergeMarks: ["type", MergeMarks],
        mergeMarksConfig: ["value", config],
    };
}
