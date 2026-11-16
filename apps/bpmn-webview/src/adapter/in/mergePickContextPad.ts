import ContextPadModule from "diagram-js/lib/features/context-pad";
import SelectionModule from "diagram-js/lib/features/selection";
import { escapeHTML } from "diagram-js/lib/util/EscapeUtil";
import { TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { bpmnElementIdOf, type BpmnDiagramElement } from "@miragon/bpmn-modeler/viewer";

import {
    leastCoveringPlacement,
    type PlacementCandidate,
    type ScreenBox,
} from "../../domain/mergeOverlayPlacement";
import type { MergePadDecision } from "../../domain/mergePadDecisions";
import { type MergeTranslate, padDecisionText } from "../../domain/mergeTexts";
import {
    elementWithLabel,
    type NeighbourhoodCanvas,
    type NeighbourhoodElement,
    neighboursOf,
    paneBoxOf,
    readableShapesOf,
    screenBoxOf,
} from "./mergeNeighbourhood";
import { setMergeTooltip } from "./mergeTooltip";

import "./mergePickContextPad.css";

/** What the pick entries ask of the merge pane that adds them. */
export interface MergePickEntryConfig {
    /** Read on every pad opening: the host sends what each element allows with every state. */
    decisionsOf(elementId: string): readonly MergePadDecision[];
    decide(elementId: string, decision: MergePadDecision): void;
    /** Receives the provider once diagram-js built it, to refresh an open pad after each state. */
    attach(provider: MergePickContextPadProvider): void;
}

/** How the pad shows its decisions: as worded buttons, or as icons with a tooltip. */
export type MergePadStyle = "words" | "icons";

interface ContextPadEntry {
    group: string;
    html: string;
    action: { click: (event: Event, element: BpmnDiagramElement) => void };
}

type ContextPadEntries = Record<string, ContextPadEntry>;

interface ContextPad {
    registerProvider(provider: MergePickContextPadProvider): void;
    isOpen(): boolean;
    open(target: BpmnDiagramElement, force: boolean): void;
}

interface Selection {
    get(): readonly BpmnDiagramElement[];
}

interface Canvas extends NeighbourhoodCanvas {
    getRootElement(): unknown;
    getGraphics(element: unknown): { getBoundingClientRect(): DOMRect };
}

interface ElementRegistry {
    getAll(): readonly unknown[];
}

interface OpenPad {
    readonly html: HTMLElement;
    readonly target?: unknown;
}

interface EventBus {
    on(event: "contextPad.open", listener: (event: { current: OpenPad }) => void): void;
    on(event: "contextPad.close" | "canvas.viewbox.changed", listener: () => void): void;
}

/** How far diagram-js puts its pad from the element, in diagram units. */
const DIAGRAM_JS_PAD_MARGIN = 8;

const PAD_GAP_PX = 6;

const ICON = (paths: string) =>
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;

const DECISION_ICONS: Record<MergePadDecision["kind"] | "keepInside", string> = {
    keep: ICON(`<path d="M20 6 9 17l-5-5"/>`),
    keepInside: ICON(
        `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m16 9-5.5 6L8 12.5"/>`,
    ),
    leaveOut: ICON(`<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`),
    keepRemovedFlows: ICON(
        `<path d="M4 12h9"/><path d="m10 8 4 4-4 4"/><circle cx="18" cy="12" r="2.5"/>`,
    ),
    undo: ICON(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`),
};

const TOOLTIP_SOURCE = "data-merge-pad-tip";

/** The pad's style, read from the page each time the pad opens; worded unless the page asks for icons. */
export function mergePadStyle(): MergePadStyle {
    return document.body.dataset.mergePadStyle === "icons" ? "icons" : "words";
}

/**
 * The merge pane's decisions beside "Show XML changes": keep the element
 * from this pane's side, with everything inside, leave it out where the
 * other side removed it, keep the flows removed with it, and undo the pick.
 * The pane decides which apply; the pad offers them, as worded buttons or as
 * icons, each with the merge chrome's styled tooltip. The pad moves from
 * diagram-js's place at the element's top right to above, below or left of
 * the element when it would cover less there of the element's flows and
 * the elements at their other ends, or else of the rest of the diagram.
 */
export class MergePickContextPadProvider {
    static $inject = [
        "contextPad",
        "canvas",
        "elementRegistry",
        "selection",
        "eventBus",
        "translate",
        "mergePickEntryConfig",
    ];

    private openPad: OpenPad | undefined;

    private placedBox: ScreenBox | undefined;

    constructor(
        private readonly contextPad: ContextPad,
        private readonly canvas: Canvas,
        private readonly registry: ElementRegistry,
        private readonly selection: Selection,
        eventBus: EventBus,
        private readonly translate: MergeTranslate,
        private readonly entryConfig: MergePickEntryConfig,
    ) {
        contextPad.registerProvider(this);
        eventBus.on("contextPad.open", ({ current }) => {
            for (const control of current.html.querySelectorAll<HTMLElement>(
                `[${TOOLTIP_SOURCE}]`,
            )) {
                setMergeTooltip(control, control.getAttribute(TOOLTIP_SOURCE) ?? undefined);
            }
            this.openPad = current;
            this.placePad();
        });
        eventBus.on("contextPad.close", () => {
            this.openPad = undefined;
            this.placedBox = undefined;
        });
        // diagram-js moves the pad with the element; a zoom changes what it would cover.
        eventBus.on("canvas.viewbox.changed", () => this.placePad());
        entryConfig.attach(this);
    }

    /** Where the open pad is on the screen, so the outcome card leaves it clear. */
    padBox(): ScreenBox | undefined {
        return this.placedBox;
    }

    /**
     * Moves the open pad, by a transform on top of diagram-js's own place,
     * which diagram-js sets later and again on every viewport change.
     */
    private placePad(): void {
        const pad = this.openPad;
        const target = pad?.target as NeighbourhoodElement | undefined;
        if (pad === undefined || target === undefined || target.waypoints !== undefined) return;
        const { width, height } = pad.html.getBoundingClientRect();
        if (width === 0 || height === 0) return;
        const element = this.canvas.getGraphics(target).getBoundingClientRect();
        const origin = {
            left: element.right + DIAGRAM_JS_PAD_MARGIN * this.canvas.viewbox().scale,
            top: element.top,
        };
        const toScreen = (part: NeighbourhoodElement) => screenBoxOf(part, this.canvas);
        const itself = elementWithLabel(target);
        const around = neighboursOf(target);
        const others = readableShapesOf(this.registry.getAll() as NeighbourhoodElement[], [
            ...itself,
            ...around,
        ]);
        const candidates = padCandidates(element, origin, { width, height });
        const chosen =
            leastCoveringPlacement(candidates, {
                keepClear: itself.map(toScreen),
                bounds: paneBoxOf(this.canvas),
                neighbours: around.map(toScreen),
                others: others.map(toScreen),
            }) ?? candidates[0].placement;
        pad.html.style.transform =
            chosen.left === 0 && chosen.top === 0
                ? ""
                : `translate(${chosen.left}px, ${chosen.top}px)`;
        this.placedBox = {
            left: origin.left + chosen.left,
            top: origin.top + chosen.top,
            width,
            height,
        };
    }

    /** Reopens an open pad, which diagram-js rebuilds only on a selection or element change, on the host's latest state. */
    refresh(): void {
        const [selected] = this.selection.get();
        if (selected !== undefined && this.contextPad.isOpen())
            this.contextPad.open(selected, true);
    }

    getContextPadEntries(element: BpmnDiagramElement): ContextPadEntries {
        if (element === this.canvas.getRootElement()) return {};
        const decisions = this.entryConfig.decisionsOf(bpmnElementIdOf(element));
        const style = mergePadStyle();
        return Object.fromEntries(
            decisions.map((decision) => [entryIdOf(decision), this.entry(decision, style)]),
        );
    }

    private entry(decision: MergePadDecision, style: MergePadStyle): ContextPadEntry {
        const { label, tip } = padDecisionText(decision, this.translate);
        const content =
            style === "words"
                ? `<span class="merge-pick-action__label">${escapeHTML(label)}</span>`
                : DECISION_ICONS[iconOf(decision)];
        // The worded button shows its label, so its tooltip adds the detail; an icon's says both.
        const tooltip = style === "words" ? tip : `${label}: ${tip}`;
        return {
            group: "merge-pick",
            html: `<button type="button" class="entry merge-pick-action merge-pick-action--${style}" aria-label="${escapeHTML(label)}" ${TOOLTIP_SOURCE}="${escapeHTML(tooltip)}">${content}</button>`,
            action: {
                click: (_event, clicked) =>
                    this.entryConfig.decide(bpmnElementIdOf(clicked), decision),
            },
        };
    }
}

/** Where the pad could go, as offsets from diagram-js's place, in the order the pad prefers them. */
function padCandidates(
    element: DOMRect,
    origin: { readonly left: number; readonly top: number },
    size: { readonly width: number; readonly height: number },
): readonly PlacementCandidate<{ readonly left: number; readonly top: number }>[] {
    const { width, height } = size;
    const alignedLeft = element.left - origin.left;
    const offsets = [
        { left: 0, top: 0 },
        { left: 0, top: element.height - height },
        { left: alignedLeft, top: -PAD_GAP_PX - height },
        { left: alignedLeft, top: element.height + PAD_GAP_PX },
        { left: alignedLeft - PAD_GAP_PX - width, top: 0 },
    ];
    return offsets.map((offset) => ({
        box: { left: origin.left + offset.left, top: origin.top + offset.top, width, height },
        placement: offset,
    }));
}

function entryIdOf(decision: MergePadDecision): string {
    return decision.kind === "keep" && decision.scope === "withContents"
        ? "merge-keep-inside"
        : `merge-${decision.kind}`;
}

function iconOf(decision: MergePadDecision): keyof typeof DECISION_ICONS {
    return decision.kind === "keep" && decision.scope === "withContents"
        ? "keepInside"
        : decision.kind;
}

/** The merge pane's pick entries on diagram-js's context pad, with the shared translator. */
export function createMergePickModule(entryConfig: MergePickEntryConfig) {
    return {
        __depends__: [ContextPadModule, SelectionModule, TranslateModule],
        __init__: ["mergePickContextPadProvider"],
        mergePickContextPadProvider: ["type", MergePickContextPadProvider],
        mergePickEntryConfig: ["value", entryConfig],
    };
}
