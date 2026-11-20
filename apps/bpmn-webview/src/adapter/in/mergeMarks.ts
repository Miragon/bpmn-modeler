import OverlaysModule from "diagram-js/lib/features/overlays";
import { escapeHTML } from "diagram-js/lib/util/EscapeUtil";
import type { MergePaneBadge, MergePickScope } from "@miragon/bpmn-modeler-shared";
import {
    MERGE_MARKER_CLASSES,
    MERGE_MARKERS,
    type MergeMarker,
    type PolylinePoint,
} from "@miragon/bpmn-modeler-types";

import { flowBadgePlace } from "../../domain/mergeFlowBadgePlace";
import { PEN_PATHS } from "./mergeDecisionIcons";

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
    get(id: string): { readonly waypoints?: readonly PolylinePoint[] } | undefined;
    forEach(visit: (element: { id: string }) => void): void;
}

interface Overlays {
    add(
        id: string,
        type: string,
        overlay: {
            position: object;
            html: string;
            scale?: object;
            show?: { minZoom?: number; maxZoom?: number };
        },
    ): string;
    remove(filter: { type: string }): void;
}

/** What a merge pane's canvas paints: the markers, the user's picks and their consequences. */
export interface MergeMarksView {
    readonly marks: Readonly<Record<MergeMarker, readonly string[]>>;
    readonly badges: readonly MergePaneBadge[];
    readonly consequences: readonly string[];
}

/** A badge's words: the kept side, its full words, and the word of a version merged by hand, given only for one. */
interface MergeBadgeText {
    readonly side: string;
    readonly label: string;
    readonly byHand?: string;
}

/** The words the canvas shows, in the pane's language. */
export interface MergeMarksLabels {
    readonly conflict: string;
    badge(badge: MergePaneBadge): MergeBadgeText;
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
    withRemoved: " merge-pick-badge--with-removed",
};

// Below this zoom a worded badge is wider than the shape it names, so it shows its check alone.
const WORDED_BADGE_MIN_ZOOM = 0.7;

// diagram-js shows an overlay from `minZoom` to `maxZoom` inclusive; ending one double lower leaves no zoom with two badges or none.
const CHECK_ONLY_BADGE_MAX_ZOOM = largestDoubleBelow(WORDED_BADGE_MIN_ZOOM);

const SHAPE_BADGE_GAP = 3;

// A pen beside the check: a version merged by hand replaces the kept side's own.
const PEN_MARK = `<svg class="merge-pick-badge__pen" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PEN_PATHS}</svg>`;

const CHECK_MARK = `<svg class="merge-pick-badge__check" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>`;

// The hatch of "taken from the other side", its non-colour cue; mergeMarks.css fills shapes with it.
const HATCH_PATTERN = `<defs><pattern id="merge-hatch" class="merge-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><rect class="merge-hatch__ground" width="8" height="8"/><line class="merge-hatch__line" x1="0" y1="0" x2="0" y2="8"/></pattern></defs>`;

/**
 * Paints a merge pane's markers: one class per marker on the elements this
 * canvas holds, plus a cue that is no colour (a "!" badge on a conflict, a
 * hatch on an element taken from the other side, a heavy contour on one
 * taken from this side); a badge on each element the user picked, naming
 * the kept side ("✓ Incoming") above a shape's top edge, clear of its type
 * icon, as a check alone at small zoom and on a flow, where a word would hide
 * the shapes it joins, with a pen and "by hand" on a version merged by hand;
 * and a dotted outline on what a pick pulled in or
 * dropped. Each paint replaces the last one; it decides nothing, the host
 * sent which element gets what.
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

    private addPickBadge(badge: MergePaneBadge, text: MergeBadgeText): void {
        const label = escapeHTML(text.label);
        const mergedByHand = text.byHand !== undefined;
        const byHand = mergedByHand ? " merge-pick-badge--by-hand" : "";
        const classes = `merge-pick-badge ${BADGE_KIND_CLASSES[badge.kind]}${BADGE_SCOPE_CLASSES[badge.pick.scope]}${byHand}`;
        const pen = mergedByHand ? PEN_MARK : "";
        const sideWord = `<span class="merge-pick-badge__side">${escapeHTML(text.side)}</span>`;
        const byHandWord = mergedByHand
            ? `<span class="merge-pick-badge__by-hand">${escapeHTML(text.byHand)}</span>`
            : "";
        const badgeHtml = (modifier: string, content: string) =>
            `<div class="${classes} ${modifier}" role="img" aria-label="${label}">${content}</div>`;
        const waypoints = this.registry.get(badge.id)?.waypoints;
        if (waypoints !== undefined) {
            const place = flowBadgePlace(waypoints);
            if (place === undefined) return;
            // Scales down with the zoom, so it keeps clear of the arrowhead its place allows for.
            this.overlays.add(badge.id, PICK_BADGE, {
                position: place,
                scale: { max: 1.5 },
                // Its round badge holds one glyph, so a version merged by hand shows the pen alone.
                html: badgeHtml("merge-pick-badge--on-flow", pen || CHECK_MARK),
            });
            return;
        }
        const position = { top: -SHAPE_BADGE_GAP, left: 0 };
        this.overlays.add(badge.id, PICK_BADGE, {
            position,
            scale: { min: 0.6, max: 1.5 },
            show: { minZoom: WORDED_BADGE_MIN_ZOOM },
            html: badgeHtml(
                "merge-pick-badge--on-shape",
                `${CHECK_MARK}${sideWord}${pen}${byHandWord}`,
            ),
        });
        this.overlays.add(badge.id, PICK_BADGE, {
            position,
            scale: { min: 0.6, max: 1.5 },
            show: { maxZoom: CHECK_ONLY_BADGE_MAX_ZOOM },
            html: badgeHtml("merge-pick-badge--on-shape", `${CHECK_MARK}${pen}`),
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

function largestDoubleBelow(positive: number): number {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, positive);
    view.setBigUint64(0, view.getBigUint64(0) - 1n);
    return view.getFloat64(0);
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
