import type { MergePaneShapelessMark } from "@miragon/bpmn-modeler-shared";
import {
    createButton,
    createElement,
    type DiffLegendSlot,
    type DiffLegendTranslator,
    DiffLegendView,
    MERGE_MARKER_CLASSES,
    MERGE_MARKERS,
    type MergeMarker,
} from "@miragon/bpmn-modeler-types";

import type { MergeStepList } from "../../domain/mergeStepper";
import { type MergePickActions, MergePickPanel, type MergePickState } from "./mergePickPanel";
import {
    MERGE_LEGEND_TEXTS,
    MERGE_MARKER_LABELS,
    type MergeTranslate,
    openConflictsText,
    shapelessEntryText,
} from "../../domain/mergeTexts";

import "./mergeLegend.css";

export interface MergeLegendActions extends MergePickActions {
    readonly onPrevious: () => void;
    readonly onNext: () => void;
    readonly onShowAll: () => void;
    readonly onStepList: (list: MergeStepList) => void;
    readonly onShapeless: (id: string) => void;
}

/** What one merge pane's legend shows; the pane decides none of it but the stepper's place. */
export interface MergeLegendState {
    readonly counts: Readonly<Record<MergeMarker, number>>;
    readonly canStep: boolean;
    readonly position?: { readonly index: number; readonly total: number };
    readonly openConflicts: number;
    readonly stepList: MergeStepList;
    readonly shapeless: readonly MergePaneShapelessMark[];
    /** The element the stepper is on. */
    readonly current?: string;
    readonly picking: MergePickState;
}

/** The legend's translator, which renders its templates with replacements. */
export type MergeLegendTranslator = DiffLegendTranslator & { translate: MergeTranslate };

const MERGE_SLOTS: readonly DiffLegendSlot<MergeMarker>[] = MERGE_MARKERS.map((marker) => ({
    key: marker,
    label: MERGE_MARKER_LABELS[marker],
    modifier: MERGE_MARKER_CLASSES[marker],
}));

const STEP_LISTS: readonly { readonly list: MergeStepList; readonly label: string }[] = [
    { list: "openConflicts", label: MERGE_LEGEND_TEXTS.openConflictSteps },
    { list: "all", label: MERGE_LEGEND_TEXTS.allSteps },
];

/**
 * A merge pane's bar: the diff legend's chrome counting the pane's markers,
 * with the merge's own controls below the counts: how many conflicts are
 * left, which list Next and Previous walk (open conflicts or every merged
 * element), the marked elements no canvas draws, each a button that steps
 * to it, and the {@link MergePickPanel}. Every control is a button, so the
 * keyboard reaches all of it.
 */
export class MergeLegend {
    private readonly view: DiffLegendView<MergeMarker>;
    private readonly openCount = createElement("span", "merge-legend__open");
    private readonly stepListGroup = createElement("div", "merge-legend__steps");
    private readonly stepListLabel = createElement("span", "merge-legend__steps-label");
    private readonly stepListButtons: ReadonlyMap<MergeStepList, HTMLButtonElement>;
    private readonly shapelessGroup = createElement("div", "merge-legend__shapeless");
    private readonly shapelessLabel = createElement("span", "merge-legend__shapeless-label");
    private readonly shapelessList = createElement("ul", "merge-legend__shapeless-list");
    private readonly picking: MergePickPanel;
    private state?: MergeLegendState;
    private listedShapeless: string | undefined;

    constructor(
        parent: HTMLElement,
        private readonly actions: MergeLegendActions,
        private readonly translator: MergeLegendTranslator,
    ) {
        this.view = new DiffLegendView<MergeMarker>(
            parent,
            {
                onPrevious: actions.onPrevious,
                onNext: actions.onNext,
                onShowAll: actions.onShowAll,
            },
            translator,
            MERGE_SLOTS,
        );
        this.stepListButtons = new Map(
            STEP_LISTS.map(({ list }) => [
                list,
                createButton("diff-legend__nav-btn merge-legend__step-list", () =>
                    actions.onStepList(list),
                ),
            ]),
        );
        this.stepListGroup.setAttribute("role", "group");
        this.stepListGroup.append(this.stepListLabel, ...this.stepListButtons.values());
        this.shapelessGroup.append(this.shapelessLabel, this.shapelessList);
        this.picking = new MergePickPanel(actions, translator.translate.bind(translator));
        this.view
            .extensionElement()
            .append(this.openCount, this.stepListGroup, this.shapelessGroup, this.picking.element);
        this.renderWords();
        translator.onChange(() => {
            this.renderWords();
            this.picking.render();
        });
    }

    update(state: MergeLegendState): void {
        this.state = state;
        this.view.update({
            counts: state.counts,
            showSwap: false,
            canStep: state.canStep,
            position: state.position,
        });
        for (const [list, listButton] of this.stepListButtons) {
            listButton.setAttribute("aria-pressed", String(list === state.stepList));
        }
        this.renderShapeless(state);
        this.picking.update(state.picking);
        this.renderWords();
    }

    /** Keeps `--diff-legend-height` on `target` at the bar's height, as the diff legend does. */
    reserveRoomOn(target: HTMLElement): void {
        this.view.reserveRoomOn(target);
    }

    /**
     * Rebuilds the entries only when the listed elements change, so a step
     * leaves the focused entry in place; a rebuild moves the focus to the
     * new entry of the same element.
     */
    private renderShapeless(state: MergeLegendState): void {
        this.shapelessGroup.hidden = state.shapeless.length === 0;
        const listed = state.shapeless.map(({ id, marker }) => `${id} ${marker}`).join("\n");
        if (listed !== this.listedShapeless) {
            this.listedShapeless = listed;
            const focused = this.focusedShapelessId();
            this.shapelessList.replaceChildren(
                ...state.shapeless.map((entry) => this.shapelessItem(entry)),
            );
            if (focused !== undefined) this.shapelessEntryOf(focused)?.focus();
        }
        for (const entryButton of this.shapelessEntries()) {
            if (entryButton.dataset.elementId === state.current) {
                entryButton.setAttribute("aria-current", "true");
            } else {
                entryButton.removeAttribute("aria-current");
            }
        }
    }

    private shapelessItem(entry: MergePaneShapelessMark): HTMLLIElement {
        const item = createElement("li", "merge-legend__shapeless-item");
        const entryButton = createButton("merge-legend__shapeless-entry", () =>
            this.actions.onShapeless(entry.id),
        );
        entryButton.dataset.elementId = entry.id;
        entryButton.dataset.marker = entry.marker;
        entryButton.append(
            createElement(
                "span",
                `diff-legend__swatch diff-legend__swatch--${MERGE_MARKER_CLASSES[entry.marker]}`,
            ),
            createElement("span", "merge-legend__shapeless-text"),
        );
        item.append(entryButton);
        return item;
    }

    private shapelessEntries(): HTMLButtonElement[] {
        return [
            ...this.shapelessList.querySelectorAll<HTMLButtonElement>(
                ".merge-legend__shapeless-entry",
            ),
        ];
    }

    private shapelessEntryOf(id: string): HTMLButtonElement | undefined {
        return this.shapelessEntries().find((entryButton) => entryButton.dataset.elementId === id);
    }

    private focusedShapelessId(): string | undefined {
        const focused = this.shapelessList.ownerDocument.activeElement;
        return focused instanceof HTMLElement && this.shapelessList.contains(focused)
            ? focused.dataset.elementId
            : undefined;
    }

    private renderWords(): void {
        const translate = this.translator.translate.bind(this.translator);
        this.openCount.textContent = openConflictsText(this.state?.openConflicts ?? 0, translate);
        this.openCount.hidden = this.state === undefined;
        this.stepListLabel.textContent = translate(MERGE_LEGEND_TEXTS.stepList);
        this.stepListGroup.setAttribute("aria-label", translate(MERGE_LEGEND_TEXTS.stepList));
        for (const { list, label } of STEP_LISTS) {
            const listButton = this.stepListButtons.get(list);
            if (listButton) listButton.textContent = translate(label);
        }
        this.shapelessLabel.textContent = translate(MERGE_LEGEND_TEXTS.shapeless);
        for (const entryButton of this.shapelessEntries()) {
            const entry = this.state?.shapeless.find(
                ({ id }) => id === entryButton.dataset.elementId,
            );
            if (!entry) continue;
            const text = shapelessEntryText(entry, translate);
            const textNode = entryButton.querySelector(".merge-legend__shapeless-text");
            if (textNode) textNode.textContent = text;
            entryButton.setAttribute(
                "aria-label",
                `${text}: ${translate(MERGE_MARKER_LABELS[entry.marker])}`,
            );
        }
    }
}
