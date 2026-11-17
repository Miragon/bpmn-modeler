import type { MergePaneBuild } from "@miragon/bpmn-modeler-shared";
import {
    createElement,
    DIFF_LEGEND_CHEVRONS,
    DIFF_LEGEND_TEXTS,
    DIFF_PLANE_MISSING_TEXT,
    diffLegendIconButton,
    type DiffLegendIconShape,
    type DiffLegendTranslator,
    MERGE_MARKER_CLASSES,
    MERGE_MARKERS,
    type MergeMarker,
    type MergeSideCaption,
    reserveLegendHeight,
} from "@miragon/bpmn-modeler-types";

import { type MergeBarFit, mergeBarFit, mergeBarFitEffects } from "../../domain/mergeBarFit";
import { type MergeStepList, mergeStepPositionText } from "../../domain/mergeStepper";
import {
    MERGE_MARKER_LABELS,
    MERGE_MENU_TEXTS,
    markerCountTip,
    mergeCaptionParts,
    mergeCaptionText,
    openConflictsText,
    openShapelessConflictsText,
} from "../../domain/mergeBarTexts";
import type { MergeMenuRowContent } from "../../domain/mergeMenuRows";
import type { MergeTranslate } from "../../domain/mergeTexts";
import { MergeBuildButton } from "./mergeBuildButton";
import { type MergeMenuActions, MergeMenu } from "./mergeMenu";
import { MergeNotesPopover } from "./mergeNotesPopover";
import { installMergeTooltips, MERGE_TOOLTIP_ATTRIBUTE } from "./mergeTooltip";

import "./mergeBar.css";

export interface MergeBarActions extends Omit<MergeMenuActions, "onReviewNotes"> {
    readonly onPrevious: () => void;
    readonly onNext: () => void;
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
    readonly position?: { readonly index: number; readonly total: number };
    /** The length of the walked list, shape-less elements included. */
    readonly total: number;
    readonly openConflicts: number;
    readonly stepList: MergeStepList;
    readonly rows: readonly MergeMenuRowContent[];
    /** The open conflicts among the rows, which "…" counts. */
    readonly shapelessConflicts: number;
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
    readonly description: HTMLElement;
}

const DOTS: readonly DiffLegendIconShape[] = [5, 12, 19].map((cx) => [
    "circle",
    { cx: String(cx), cy: "12", r: "1.5" },
]);

let bars = 0;

/**
 * A merge pane's one-line bar in the diff legend's look, with one fixed
 * height on both panes, so the two diagrams stay level: the pane's caption
 * and its marker counts; on the right pane also ‹, the place in the walked
 * list and ›, the "…" {@link MergeMenu} with its {@link MergeNotesPopover},
 * and Build, disabled with the conflicts left as its tooltip and its
 * description. Where the line does not fit, the caption drops its branch
 * and commit, then the counts their labels, then Build moves into the menu
 * and the gaps tighten ({@link mergeBarFit}); tooltips keep the words, and
 * nothing wraps.
 */
export class MergeBar {
    readonly element = createElement("div", "diff-legend merge-bar");
    private readonly row = createElement("div", "merge-bar__row");
    private readonly caption = createElement("span", "merge-bar__caption");
    private readonly captionSide = createElement("span", "merge-bar__caption-side");
    private readonly captionDetail = createElement("span", "merge-bar__caption-detail");
    private readonly captionMissing = createElement("span", "merge-bar__caption-missing");
    private readonly counts = createElement("div", "merge-bar__counts");
    private readonly descriptions = createElement("div", "");
    private readonly countSlots: readonly CountSlot[];
    private readonly none = createElement("span", "diff-legend__none");
    private readonly nav = createElement("div", "diff-legend__nav merge-bar__nav");
    private readonly previousButton: HTMLButtonElement;
    private readonly nextButton: HTMLButtonElement;
    private readonly position = createElement("span", "diff-legend__position merge-bar__position");
    private readonly actionsGroup = createElement("div", "merge-bar__actions");
    private readonly moreButton: HTMLButtonElement;
    private readonly moreBadge = createElement("span", "merge-bar__badge");
    private readonly build: MergeBuildButton;
    private readonly menu: MergeMenu;
    private readonly notes: MergeNotesPopover;
    private state?: MergeBarState;
    private fitted: MergeBarFit = "full";
    private planeMissing = false;
    private sizeObserver?: ResizeObserver;
    private readonly translate: MergeTranslate = (key, replacements) =>
        this.translator.translate(key, replacements);

    constructor(
        parent: HTMLElement,
        actions: MergeBarActions,
        private readonly translator: MergeBarTranslator,
    ) {
        bars += 1;
        installMergeTooltips(parent.ownerDocument);
        const { translate } = this;
        this.countSlots = MERGE_MARKERS.map((marker) => countSlot(marker, bars));
        this.previousButton = diffLegendIconButton(
            "diff-legend__prev-btn",
            [["path", { d: DIFF_LEGEND_CHEVRONS.previous }]],
            () => actions.onPrevious(),
        );
        this.nextButton = diffLegendIconButton(
            "diff-legend__next-btn",
            [["path", { d: DIFF_LEGEND_CHEVRONS.next }]],
            () => actions.onNext(),
        );
        this.moreButton = diffLegendIconButton("merge-bar__more", DOTS, () => this.toggleMenu());
        this.build = new MergeBuildButton(
            createElement("span", "merge-bar__build-wrap"),
            "diff-legend__nav-btn merge-bar__build",
            `merge-bar-build-blocked-${bars}`,
            () => {
                if (this.state?.controls?.build.canBuild) actions.onBuild();
            },
        );
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
        this.assemble();
        parent.append(this.element);
        this.renderWords();
        translator.onChange(() => {
            this.renderWords();
            this.menu.render();
            this.notes.render();
        });
        if (typeof ResizeObserver !== "undefined") {
            new ResizeObserver(() => this.fit()).observe(this.element);
        }
    }

    update(state: MergeBarState): void {
        this.state = state;
        this.element.hidden = false;
        for (const { marker, slot, count } of this.countSlots) {
            slot.hidden = state.counts[marker] === 0;
            count.textContent = String(state.counts[marker]);
        }
        this.none.hidden = MERGE_MARKERS.some((marker) => state.counts[marker] > 0);
        const { controls } = state;
        this.nav.hidden = controls === undefined;
        this.actionsGroup.hidden = controls === undefined;
        if (controls) {
            this.previousButton.disabled = !controls.canStep;
            this.nextButton.disabled = !controls.canStep;
            this.position.textContent = mergeStepPositionText(controls.position, controls.total);
            this.moreBadge.hidden = controls.shapelessConflicts === 0;
            this.moreBadge.textContent = String(controls.shapelessConflicts);
            this.notes.update({ notes: controls.build.notes, nameOf: controls.nameOf });
        }
        this.renderWords();
    }

    /** Adds "Not in this version" to the caption while the pane's version lacks the plane shown. */
    showPlaneMissing(missing: boolean): void {
        this.planeMissing = missing;
        this.renderWords();
    }

    /** Opens the menu at a shape-less element's row, on the pane that has the menu. */
    openMenuAt(elementId: string): void {
        if (this.state?.controls === undefined) return;
        this.notes.close(false);
        this.menu.openAt(elementId);
    }

    /** A step onto a drawn element closes the menu a step opened; one the user opened stays. */
    closeMenuOpenedByStep(): void {
        if (this.menu.openedByStep()) this.menu.close(false);
    }

    /** Announces what a row's decision did, which the row says too. */
    announceRowOutcome(lines: readonly string[]): void {
        this.menu.announce(lines);
    }

    /** Keeps `--diff-legend-height` on `target` at the bar's height, as the diff's bar does. */
    reserveRoomOn(target: HTMLElement): void {
        this.sizeObserver?.disconnect();
        this.sizeObserver = reserveLegendHeight(this.element, target);
    }

    private toggleMenu(): void {
        if (this.notes.isOpen()) {
            this.notes.close(false);
            this.menu.open(true);
        } else if (this.menu.isOpen()) {
            this.menu.close(false);
        } else {
            this.menu.open(true);
        }
    }

    /** Says as much as fits on the line; the menu takes Build where the line has no room for it. */
    private fit(): void {
        this.fitted = mergeBarFit((fit) => {
            this.applyFit(fit);
            return [this.row, this.caption, this.counts].some(
                (part) => part.scrollWidth > part.clientWidth,
            );
        });
        this.applyFit(this.fitted);
        const caption = this.state?.caption;
        setTooltip(
            this.caption,
            caption === undefined || this.fitted === "full"
                ? undefined
                : mergeCaptionText(caption, this.translate),
        );
        this.renderMenu();
    }

    /** The stylesheet reads only the fit's effects, so the fits' order lives in {@link mergeBarFit} alone. */
    private applyFit(fit: MergeBarFit): void {
        this.element.dataset.fit = fit;
        for (const [effect, applies] of Object.entries(mergeBarFitEffects(fit))) {
            if (applies) this.element.dataset[effect] = "";
            else delete this.element.dataset[effect];
        }
    }

    private assemble(): void {
        this.element.hidden = true;
        this.nav.hidden = true;
        this.actionsGroup.hidden = true;
        this.row.setAttribute("role", "toolbar");
        this.caption.append(this.captionSide, this.captionDetail, this.captionMissing);
        this.counts.append(...this.countSlots.map(({ slot }) => slot), this.none);
        this.descriptions.hidden = true;
        this.descriptions.append(...this.countSlots.map(({ description }) => description));
        this.nav.append(this.previousButton, this.position, this.nextButton);
        this.nav.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && this.menu.isOpen()) {
                event.preventDefault();
                this.menu.close(false);
            }
        });
        this.moreButton.append(this.moreBadge);
        this.moreBadge.setAttribute("aria-hidden", "true");
        this.moreButton.setAttribute("aria-haspopup", "dialog");
        this.moreButton.setAttribute("aria-expanded", "false");
        this.moreButton.setAttribute("aria-controls", this.menu.element.id);
        this.actionsGroup.append(this.moreButton, this.build.wrap);
        this.row.append(this.caption, this.counts, this.nav, this.actionsGroup);
        this.element.append(this.row, this.descriptions, this.menu.element, this.notes.element);
    }

    private renderMenu(): void {
        const controls = this.state?.controls;
        if (!controls) return;
        this.menu.update({
            ...(mergeBarFitEffects(this.fitted).buildInMenu ? { build: controls.build } : {}),
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
        const { translate, state } = this;
        this.row.setAttribute("aria-label", translate(DIFF_LEGEND_TEXTS.changes));
        if (state) {
            const { side, detail } = mergeCaptionParts(state.caption, translate);
            this.captionSide.textContent = side;
            this.captionDetail.textContent = detail === undefined ? "" : `: ${detail}`;
        }
        this.captionMissing.textContent = this.planeMissing
            ? ` · ${translate(DIFF_PLANE_MISSING_TEXT)}`
            : "";
        for (const { marker, slot, label, count, description } of this.countSlots) {
            label.textContent = `${translate(MERGE_MARKER_LABELS[marker])} `;
            const tip = markerCountTip(marker, Number(count.textContent), translate);
            description.textContent = tip;
            setTooltip(slot, tip);
        }
        this.none.textContent = translate(DIFF_LEGEND_TEXTS.none);
        nameIconButton(this.previousButton, translate(DIFF_LEGEND_TEXTS.previous));
        nameIconButton(this.nextButton, translate(DIFF_LEGEND_TEXTS.next));
        const controls = state?.controls;
        setTooltip(
            this.position,
            controls === undefined
                ? undefined
                : openConflictsText(controls.openConflicts, translate),
        );
        const shapelessOpen = controls?.shapelessConflicts ?? 0;
        nameIconButton(
            this.moreButton,
            [
                translate(MERGE_MENU_TEXTS.more),
                ...(shapelessOpen > 0
                    ? [openShapelessConflictsText(shapelessOpen, translate)]
                    : []),
            ].join(", "),
        );
        this.build.render(controls?.build, translate);
        this.fit();
    }
}

function countSlot(marker: MergeMarker, bar: number): CountSlot {
    const modifier = MERGE_MARKER_CLASSES[marker];
    const slot = createElement(
        "div",
        `diff-legend__slot diff-legend__slot--${modifier} merge-bar__slot`,
    );
    const text = createElement("span", "diff-legend__label");
    const label = createElement("span", "merge-bar__slot-label");
    const count = createElement("b", "diff-legend__count");
    const description = createElement("span", "");
    description.id = `merge-bar-${bar}-${modifier}`;
    slot.setAttribute("aria-describedby", description.id);
    text.append(label, count);
    slot.append(
        createElement("span", `diff-legend__swatch diff-legend__swatch--${modifier}`),
        text,
    );
    return { marker, slot, label, count, description };
}

function setTooltip(element: HTMLElement, text: string | undefined): void {
    if (text) element.setAttribute(MERGE_TOOLTIP_ATTRIBUTE, text);
    else element.removeAttribute(MERGE_TOOLTIP_ATTRIBUTE);
}

/** An icon-only button's name, for screen readers, and its styled tooltip. */
function nameIconButton(button: HTMLButtonElement, label: string): void {
    button.setAttribute("aria-label", label);
    setTooltip(button, label);
}
