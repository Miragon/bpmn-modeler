import OverlaysModule from "diagram-js/lib/features/overlays";
import { escapeHTML } from "diagram-js/lib/util/EscapeUtil";
import type { MergePaneBadge, MergePickScope } from "@miragon/bpmn-modeler-shared";
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

interface Point {
    readonly x: number;
    readonly y: number;
}

interface ElementRegistry {
    get(id: string): { readonly id: string; readonly waypoints?: readonly Point[] } | undefined;
    forEach(visit: (element: { id: string }) => void): void;
}

interface Overlays {
    add(
        id: string,
        type: string,
        overlay: { position: object; html: string; scale?: object },
    ): string;
    remove(filter: { type: string }): void;
}

/** What a merge pane's canvas paints: the markers, the user's picks and their consequences. */
export interface MergeMarksView {
    readonly marks: Readonly<Record<MergeMarker, readonly string[]>>;
    readonly badges: readonly MergePaneBadge[];
    readonly consequences: readonly string[];
}

/** The words the canvas shows, in the pane's language. */
export interface MergeMarksLabels {
    readonly conflict: string;
    badge(badge: MergePaneBadge): { readonly side: string; readonly label: string };
}

const CONFLICT_BADGE = "merge-conflict-badge";

const PICK_BADGE = "merge-pick";

const CONSEQUENCE = "merge-consequence";

const BADGE_KIND_CLASSES: Record<MergePaneBadge["kind"], string> = {
    keptHere: "merge-pick-badge--kept-here",
    replacedHere: "merge-pick-badge--replaced-here",
};

const BADGE_SCOPE_CLASSES: Record<MergePickScope, string> = {
    element: "",
    withContents: " merge-pick-badge--with-contents",
    withConnections: " merge-pick-badge--with-connections",
};

const CHECK_MARK = `<svg class="merge-pick-badge__check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>`;

// The hatch of "taken from the other side", its non-colour cue; mergeMarks.css fills shapes with it.
const HATCH_PATTERN = `<defs><pattern id="merge-hatch" class="merge-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect class="merge-hatch__ground" width="8" height="8"/><line class="merge-hatch__line" x1="0" y1="0" x2="0" y2="8"/></pattern></defs>`;

/**
 * Paints a merge pane's markers: one class per marker on the elements this
 * canvas holds, plus a cue that is no colour (a "!" badge on a conflict, a
 * hatch on an element taken from the other side, a heavy contour on one
 * taken from this side); a badge over the top-left corner of each element
 * the user picked, naming the kept side in words ("✓ Incoming"), or a
 * check alone in the middle of a picked flow's longest segment, since a
 * worded badge at a short flow's end hid the shape it joins; and a dotted
 * outline on what a pick pulled in or dropped. Each paint replaces the last one; it decides
 * nothing, the host sent which element gets what.
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

    paint(view: MergeMarksView, labels: MergeMarksLabels): void {
        this.clear();
        // Overlays throw on an id the canvas lacks, and the partner pane may hold it alone.
        const held = (id: string) => this.registry.get(id) !== undefined;
        for (const marker of MERGE_MARKERS) {
            for (const id of view.marks[marker].filter(held)) {
                this.canvas.addMarker(id, MERGE_MARKER_CLASSES[marker]);
                if (marker === "conflict") this.addConflictBadge(id, labels.conflict);
            }
        }
        for (const id of view.consequences.filter(held)) this.canvas.addMarker(id, CONSEQUENCE);
        for (const badge of view.badges.filter(({ id }) => held(id))) {
            this.addPickBadge(badge, labels.badge(badge));
        }
    }

    private clear(): void {
        this.overlays.remove({ type: CONFLICT_BADGE });
        this.overlays.remove({ type: PICK_BADGE });
        this.registry.forEach(({ id }) => {
            for (const marker of MERGE_MARKERS) {
                this.canvas.removeMarker(id, MERGE_MARKER_CLASSES[marker]);
            }
            this.canvas.removeMarker(id, CONSEQUENCE);
        });
    }

    private addPickBadge(
        badge: MergePaneBadge,
        text: { readonly side: string; readonly label: string },
    ): void {
        const label = escapeHTML(text.label);
        const classes = `merge-pick-badge ${BADGE_KIND_CLASSES[badge.kind]}${BADGE_SCOPE_CLASSES[badge.scope]}`;
        const middle = middleOfLongestSegment(this.registry.get(badge.id)?.waypoints);
        if (middle !== undefined) {
            this.overlays.add(badge.id, PICK_BADGE, {
                position: middle,
                scale: { min: 0.8, max: 1.5 },
                html: `<div class="${classes} merge-pick-badge--on-flow" role="img" aria-label="${label}" title="${label}">${CHECK_MARK}</div>`,
            });
            return;
        }
        // Top left: the drilldown button of a collapsed sub-process sits bottom right.
        this.overlays.add(badge.id, PICK_BADGE, {
            position: { top: -11, left: -11 },
            scale: { min: 0.6, max: 1.5 },
            html: `<div class="${classes}" role="img" aria-label="${label}" title="${label}">${CHECK_MARK}<span class="merge-pick-badge__side">${escapeHTML(text.side)}</span></div>`,
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

/**
 * The middle of a flow's longest segment, relative to the top left corner of
 * its waypoints' box, where diagram-js anchors a flow's overlay; `undefined`
 * for a shape.
 */
function middleOfLongestSegment(
    waypoints: readonly Point[] | undefined,
): { readonly left: number; readonly top: number } | undefined {
    if (waypoints === undefined || waypoints.length < 2) return undefined;
    let longest = { from: waypoints[0], to: waypoints[1], length: -1 };
    for (let index = 1; index < waypoints.length; index += 1) {
        const from = waypoints[index - 1];
        const to = waypoints[index];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length > longest.length) longest = { from, to, length };
    }
    const left = Math.min(...waypoints.map(({ x }) => x));
    const top = Math.min(...waypoints.map(({ y }) => y));
    return {
        left: (longest.from.x + longest.to.x) / 2 - left,
        top: (longest.from.y + longest.to.y) / 2 - top,
    };
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
