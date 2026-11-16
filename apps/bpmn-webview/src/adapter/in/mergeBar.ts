import type { MergePaneBuild } from "@miragon/bpmn-modeler-shared";
import {
    createButton,
    createElement,
    DIFF_LEGEND_TEXTS,
    DIFF_PLANE_MISSING_TEXT,
    type DiffLegendTranslator,
    MERGE_MARKER_CLASSES,
    MERGE_MARKERS,
    type MergeMarker,
    type MergeSideCaption,
} from "@miragon/bpmn-modeler-types";

import type { MergeShapelessRow } from "../../domain/mergeShapelessRows";
import { type MergeStepList, mergeStepPositionText } from "../../domain/mergeStepper";
import {
    buildBlockedText,
    MERGE_BUILD_TEXTS,
    MERGE_MARKER_LABELS,
    MERGE_MENU_TEXTS,
    mergeCaptionParts,
    type MergeTranslate,
    openConflictsText,
    openShapelessConflictsText,
} from "../../domain/mergeTexts";
import { type MergeMenuActions, MergeMenu } from "./mergeMenu";
import { MergeNotesPopover } from "./mergeNotesPopover";
import { setMergeTooltip } from "./mergeTooltip";

import "./mergeBar.css";

export interface MergeBarActions extends Omit<MergeMenuActions, "onReviewNotes"> {
    readonly onPrevious: () => void;
    readonly onNext: () => void;
    readonly onBuild: () => void;
    /** Shows an element a build note names. */
    readonly onSelect: (elementId: string) => void;
}

/** What one merge pane's bar shows; the host decided all of it but the stepper's place. */
export interface MergeBarState {
    readonly caption: MergeSideCaption;
    readonly counts: Readonly<Record<MergeMarker, number>>;
    /** The stepper, the "…" menu and Build, on the right pane only. */
    readonly controls?: MergeBarControls;
}

export interface MergeBarControls {
    readonly canStep: boolean;
    /** Where the stepper stands in the walked list, counted from 0; absent before a step. */
    readonly position?: { readonly index: number };
    /** The length of the walked list, shape-less elements included. */
    readonly total: number;
    readonly stepList: MergeStepList;
    readonly openConflicts: number;
    readonly rows: readonly MergeShapelessRow[];
    readonly openShapelessConflicts: number;
    /** The element the stepper is on. */
    readonly current?: string;
    readonly build: MergePaneBuild;
    readonly nameOf: (elementId: string) => string;
}

/** The bar's translator, which renders its templates with replacements. */
export type MergeBarTranslator = DiffLegendTranslator & { translate: MergeTranslate };

interface CountSlot {
    readonly marker: MergeMarker;
    readonly slot: HTMLElement;
    readonly label: HTMLElement;
    readonly count: HTMLElement;
}

/**
 * How much the bar says, from all of it down to what fits one line: the
 * counts without their labels, then the caption without its branch.
 */
const FITS = ["full", "unlabelled", "compact"] as const;

const CHEVRON_LEFT = "m15 18-6-6 6-6";
const CHEVRON_RIGHT = "m9 18 6-6-6-6";
const DOTS =
    '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>';

let bars = 0;

/**
 * A merge pane's one-line bar, in the diff legend's look and with its fixed
 * height on both panes, so the diagrams stay level: the pane's caption and
 * its marker counts; on the right pane also Previous, the place in the
 * walked list and Next, the "…" {@link MergeMenu} and Build, disabled with
 * the conflicts left as its tooltip. Where the line does not fit, whatever
 * the pane's width and the number of markers, the counts drop their labels
 * (a tooltip keeps them), then the caption keeps its side word only; nothing
 * is cut off and nothing wraps.
 */
export class MergeBar {
    readonly element = createElement("div", "diff-legend merge-bar");
    private readonly row = createElement("div", "merge-bar__row");
    private readonly caption = createElement("span", "merge-bar__caption");
    private readonly captionSide = createElement("span", "merge-bar__caption-side");
    private readonly captionDetail = createElement("span", "merge-bar__caption-detail");
    private readonly captionMissing = createElement("span", "merge-bar__caption-missing");
    private readonly counts = createElement("div", "merge-bar__counts");
    private readonly countSlots: readonly CountSlot[];
    private readonly none = createElement("span", "diff-legend__none");
    private readonly nav = createElement("div", "diff-legend__nav merge-bar__nav");
    private readonly previousButton: HTMLButtonElement;
    private readonly nextButton: HTMLButtonElement;
    private readonly position = createElement("span", "diff-legend__position");
    private readonly actionsGroup = createElement("div", "merge-bar__actions");
    private readonly moreButton: HTMLButtonElement;
    private readonly moreBadge = createElement("span", "merge-bar__badge");
    private readonly buildWrap = createElement("span", "merge-bar__build-wrap");
    private readonly buildButton: HTMLButtonElement;
    private readonly buildBlocked = createElement("span", "merge-bar__visually-hidden");
    private readonly menu: MergeMenu;
    private readonly notes: MergeNotesPopover;
    private state?: MergeBarState;
    private planeMissing = false;
    private sizeObserver?: ResizeObserver;
    private widthObserver?: ResizeObserver;

    constructor(
        parent: HTMLElement,
        actions: MergeBarActions,
        private readonly translator: MergeBarTranslator,
    ) {
        bars += 1;
        const translate: MergeTranslate = (key, replacements) =>
            translator.translate(key, replacements);
        this.countSlots = MERGE_MARKERS.map((marker) => countSlot(marker));
        this.previousButton = iconButton("diff-legend__prev-btn", chevron(CHEVRON_LEFT), () =>
            actions.onPrevious(),
        );
        this.nextButton = iconButton("diff-legend__next-btn", chevron(CHEVRON_RIGHT), () =>
            actions.onNext(),
        );
        this.moreButton = iconButton("merge-bar__more", icon(DOTS), () => {
            if (this.notes.isOpen()) this.notes.close(false);
            if (this.menu.isOpen()) this.menu.close(false);
            else this.menu.open(true);
        });
        this.moreButton.append(this.moreBadge);
        this.moreButton.setAttribute("aria-haspopup", "dialog");
        this.moreButton.setAttribute("aria-expanded", "false");
        this.buildButton = createButton("diff-legend__nav-btn merge-bar__build", () => {
            if (this.state?.controls?.build.canBuild) actions.onBuild();
        });
        this.buildBlocked.id = `merge-bar-build-blocked-${bars}`;
        this.buildWrap.append(this.buildButton, this.buildBlocked);
        this.menu = new MergeMenu(
            {
                ...actions,
                onReviewNotes: () => {
                    this.menu.close(false);
                    this.notes.open();
                    this.renderMenu();
                },
            },
            translate,
            this.moreButton,
        );
        this.notes = new MergeNotesPopover(
            translate,
            (id) => actions.onSelect(id),
            this.moreButton,
            () => this.renderMenu(),
        );
        this.moreButton.setAttribute("aria-controls", this.menu.element.id);
        this.assemble();
        parent.append(this.element);
        this.renderWords();
        translator.onChange(() => {
            this.renderWords();
            this.menu.render();
            this.notes.render();
        });
        if (typeof ResizeObserver !== "undefined") {
            this.widthObserver = new ResizeObserver(() => this.fit());
            this.widthObserver.observe(this.element);
        }
    }

    update(state: MergeBarState): void {
        this.state = state;
        this.element.hidden = false;
        for (const { marker, slot, count } of this.countSlots) {
            const markers = state.counts[marker];
            slot.hidden = markers === 0;
            count.textContent = String(markers);
        }
        this.none.hidden = MERGE_MARKERS.some((marker) => state.counts[marker] > 0);
        const controls = state.controls;
        this.nav.hidden = controls === undefined;
        this.actionsGroup.hidden = controls === undefined;
        if (controls) {
            this.previousButton.disabled = !controls.canStep;
            this.nextButton.disabled = !controls.canStep;
            this.position.textContent = mergeStepPositionText(controls.position, controls.total);
            this.moreBadge.hidden = controls.openShapelessConflicts === 0;
            this.moreBadge.textContent = String(controls.openShapelessConflicts);
            this.buildButton.disabled = !controls.build.canBuild;
            this.notes.update({ notes: controls.build.notes, nameOf: controls.nameOf });
            this.renderMenu();
        }
        this.renderWords();
    }

    /** Says as much as fits on the line: each step drops more until nothing is cut off. */
    private fit(): void {
        for (const fit of FITS) {
            this.element.dataset.fit = fit;
            if (!this.overflows()) return;
        }
    }

    private overflows(): boolean {
        return [this.caption, this.counts, this.row].some(
            (part) => part.scrollWidth > part.clientWidth,
        );
    }

    /** Adds "Not in this version" to the caption while the pane's version lacks the plane shown. */
    showPlaneMissing(missing: boolean): void {
        this.planeMissing = missing;
        this.renderWords();
    }

    /** Opens the "…" menu at a shape-less element's row, on the pane that has the menu. */
    openMenuAt(elementId: string): void {
        if (this.state?.controls === undefined) return;
        this.notes.close(false);
        this.menu.openAt(elementId);
    }

    /** Shows what a pick from a shape-less row did in that row; `undefined` clears it. */
    showShapelessOutcome(elementId: string, text: string | undefined): void {
        this.menu.showRowOutcome(elementId, text);
    }

    /** Keeps `--diff-legend-height` on `target` at the bar's height, as the diff legend does. */
    reserveRoomOn(target: HTMLElement): void {
        if (typeof ResizeObserver === "undefined") return;
        this.sizeObserver?.disconnect();
        this.sizeObserver = new ResizeObserver(() => {
            const height = this.element.offsetHeight;
            if (height > 0) target.style.setProperty("--diff-legend-height", `${height}px`);
        });
        this.sizeObserver.observe(this.element);
    }

    private assemble(): void {
        this.element.hidden = true;
        this.row.setAttribute("role", "toolbar");
        this.caption.append(this.captionSide, this.captionDetail, this.captionMissing);
        this.counts.append(...this.countSlots.map(({ slot }) => slot), this.none);
        this.nav.append(this.previousButton, this.position, this.nextButton);
        this.actionsGroup.append(this.moreButton, this.buildWrap);
        this.row.append(this.caption, this.counts, this.nav, this.actionsGroup);
        this.element.append(this.row, this.menu.element, this.notes.element);
    }

    private renderMenu(): void {
        const controls = this.state?.controls;
        if (!controls) return;
        this.menu.update({
            stepList: controls.stepList,
            canStep: controls.canStep,
            rows: controls.rows,
            ...(controls.current === undefined ? {} : { current: controls.current }),
            built: controls.build.built,
            notesCount: controls.build.notes.length,
            notesOpen: this.notes.isOpen(),
        });
    }

    private renderWords(): void {
        const translate: MergeTranslate = (key, replacements) =>
            this.translator.translate(key, replacements);
        this.row.setAttribute("aria-label", translate(DIFF_LEGEND_TEXTS.changes));
        const state = this.state;
        if (state) {
            const { side, detail } = mergeCaptionParts(state.caption, translate);
            this.captionSide.textContent = side;
            this.captionDetail.textContent = detail === undefined ? "" : `: ${detail}`;
        }
        this.captionMissing.textContent = this.planeMissing
            ? ` · ${translate(DIFF_PLANE_MISSING_TEXT)}`
            : "";
        setMergeTooltip(this.caption, this.caption.textContent ?? undefined);
        for (const { marker, slot, label, count } of this.countSlots) {
            const markerLabel = translate(MERGE_MARKER_LABELS[marker]);
            label.textContent = `${markerLabel} `;
            setMergeTooltip(slot, `${markerLabel}: ${count.textContent}`);
        }
        this.none.textContent = translate(DIFF_LEGEND_TEXTS.none);
        nameIconButton(this.previousButton, translate(DIFF_LEGEND_TEXTS.previous));
        nameIconButton(this.nextButton, translate(DIFF_LEGEND_TEXTS.next));
        const controls = state?.controls;
        setMergeTooltip(
            this.position,
            controls?.stepList === "openConflicts"
                ? openConflictsText(controls.openConflicts, translate)
                : undefined,
        );
        const shapelessOpen = controls?.openShapelessConflicts ?? 0;
        const moreName = [
            translate(MERGE_MENU_TEXTS.more),
            ...(shapelessOpen > 0 ? [openShapelessConflictsText(shapelessOpen, translate)] : []),
        ].join(", ");
        this.moreButton.setAttribute("aria-label", moreName);
        setMergeTooltip(this.moreButton, moreName);
        this.buildButton.textContent = translate(MERGE_BUILD_TEXTS.build);
        const blocked = controls !== undefined && !controls.build.canBuild;
        this.buildBlocked.textContent = blocked
            ? buildBlockedText(controls.build.openConflicts, translate)
            : "";
        setMergeTooltip(this.buildWrap, blocked ? this.buildBlocked.textContent : undefined);
        if (blocked) this.buildButton.setAttribute("aria-describedby", this.buildBlocked.id);
        else this.buildButton.removeAttribute("aria-describedby");
        this.fit();
    }
}

function countSlot(marker: MergeMarker): CountSlot {
    const modifier = MERGE_MARKER_CLASSES[marker];
    const slot = createElement(
        "div",
        `diff-legend__slot diff-legend__slot--${modifier} merge-bar__slot`,
    );
    const text = createElement("span", "diff-legend__label");
    const label = createElement("span", "merge-bar__slot-label");
    const count = createElement("b", "diff-legend__count");
    text.append(label, count);
    slot.append(
        createElement("span", `diff-legend__swatch diff-legend__swatch--${modifier}`),
        text,
    );
    return { marker, slot, label, count };
}

/** An icon-only button's name, for screen readers; its tooltip is the styled one. */
function nameIconButton(button: HTMLButtonElement, label: string): void {
    button.setAttribute("aria-label", label);
    setMergeTooltip(button, label);
}

function iconButton(
    modifier: string,
    glyph: SVGSVGElement,
    onClick: () => void,
): HTMLButtonElement {
    const button = createButton(`diff-legend__nav-btn ${modifier}`, onClick);
    button.append(glyph);
    return button;
}

function chevron(path: string): SVGSVGElement {
    return icon(`<path d="${path}"/>`);
}

function icon(paths: string): SVGSVGElement {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const glyph = document.createElementNS(svgNamespace, "svg");
    glyph.setAttribute("viewBox", "0 0 24 24");
    glyph.setAttribute("aria-hidden", "true");
    glyph.classList.add("diff-legend__icon");
    glyph.innerHTML = paths;
    return glyph;
}
