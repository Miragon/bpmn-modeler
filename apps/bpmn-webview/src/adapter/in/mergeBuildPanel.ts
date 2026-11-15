import type { MergePaneBuild, MergePaneBuildNote } from "@miragon/bpmn-modeler-shared";
import { createButton, createElement, MERGE_SIDES, type MergeSide } from "@miragon/bpmn-modeler-types";

import {
    buildBlockedText,
    buildNoteText,
    compareWithText,
    MERGE_BUILD_TEXTS,
    type MergeTranslate,
    reviewNotesText,
} from "../../domain/mergeTexts";

export interface MergeBuildActions {
    readonly onBuild: () => void;
    readonly onCompare: (against: MergeSide) => void;
    /** Shows an element a note names, on this pane. */
    readonly onSelect: (elementId: string) => void;
}

/** What the build part of the right pane's legend shows; the host decided all of it. */
export interface MergeBuildState {
    readonly build: MergePaneBuild;
    readonly nameOf: (elementId: string) => string;
}

let panels = 0;

/**
 * The build part of the right pane's legend: Build, disabled with the
 * conflicts left; the comparisons of the built result with either side,
 * enabled once one is built; and the notes of the last build behind a
 * toggle, each naming its elements as buttons that show them.
 */
export class MergeBuildPanel {
    readonly element = createElement("div", "merge-legend__build");
    private readonly buildButton: HTMLButtonElement;
    private readonly blocked = createElement("span", "merge-legend__build-blocked");
    private readonly compareButtons: ReadonlyMap<MergeSide, HTMLButtonElement>;
    private readonly reviewButton: HTMLButtonElement;
    private readonly notesList = createElement("ul", "merge-legend__notes");
    private state?: MergeBuildState;
    private shownNotes?: string;
    private notesOpen = false;

    constructor(
        private readonly actions: MergeBuildActions,
        private readonly translate: MergeTranslate,
    ) {
        panels += 1;
        this.blocked.id = `merge-legend-build-blocked-${panels}`;
        this.notesList.id = `merge-legend-notes-${panels}`;
        this.buildButton = createButton("diff-legend__nav-btn merge-legend__build-btn", () => {
            if (this.state?.build.canBuild) actions.onBuild();
        });
        this.compareButtons = new Map(
            MERGE_SIDES.map((side) => [
                side,
                createButton("diff-legend__nav-btn merge-legend__compare", () => {
                    if (this.state?.build.built) actions.onCompare(side);
                }),
            ]),
        );
        this.reviewButton = createButton("diff-legend__nav-btn merge-legend__review", () => {
            this.notesOpen = !this.notesOpen;
            this.render();
        });
        this.reviewButton.setAttribute("aria-controls", this.notesList.id);
        this.element.setAttribute("role", "group");
        this.element.append(
            this.buildButton,
            this.blocked,
            ...this.compareButtons.values(),
            this.reviewButton,
            this.notesList,
        );
        this.element.hidden = true;
    }

    /** Shows the build part from `state`, or hides it on a pane that shows none. */
    update(state: MergeBuildState | undefined): void {
        this.state = state;
        this.render();
    }

    /** Writes every word again, after an update or a change of language. */
    render(): void {
        const state = this.state;
        this.element.hidden = state === undefined;
        if (!state) return;
        const { build } = state;
        this.element.setAttribute("aria-label", this.translate(MERGE_BUILD_TEXTS.build));
        this.buildButton.textContent = this.translate(MERGE_BUILD_TEXTS.build);
        this.buildButton.disabled = !build.canBuild;
        this.blocked.hidden = build.canBuild;
        this.blocked.textContent = buildBlockedText(build.openConflicts, this.translate);
        if (build.canBuild) {
            this.buildButton.removeAttribute("aria-describedby");
        } else {
            this.buildButton.setAttribute("aria-describedby", this.blocked.id);
        }
        for (const [side, compareButton] of this.compareButtons) {
            compareButton.textContent = compareWithText(side, this.translate);
            compareButton.disabled = !build.built;
        }
        this.reviewButton.hidden = build.notes.length === 0;
        this.reviewButton.textContent = reviewNotesText(build.notes.length, this.translate);
        this.reviewButton.setAttribute("aria-expanded", String(this.notesOpen));
        this.notesList.hidden = !this.notesOpen || build.notes.length === 0;
        this.notesList.setAttribute("aria-label", this.translate(MERGE_BUILD_TEXTS.notes));
        this.renderNotes(state);
    }

    // Rebuilt only when the notes or their words change, so a step leaves the focused entry in place.
    private renderNotes({ build, nameOf }: MergeBuildState): void {
        const texts = build.notes.map((note) => buildNoteText(note, nameOf, this.translate));
        const shown = JSON.stringify([build.notes, texts]);
        if (shown === this.shownNotes) return;
        this.shownNotes = shown;
        this.notesList.replaceChildren(
            ...build.notes.map((note, index) => this.noteItem(note, texts[index], nameOf)),
        );
    }

    private noteItem(
        note: MergePaneBuildNote,
        text: string,
        nameOf: (elementId: string) => string,
    ): HTMLLIElement {
        const item = createElement("li", "merge-legend__note");
        item.append(
            createElement("span", "merge-legend__note-text", text),
            ...noteElementIds(note).map((id) =>
                createButton("merge-legend__shapeless-entry", () => this.actions.onSelect(id), nameOf(id)),
            ),
        );
        return item;
    }
}

function noteElementIds(note: MergePaneBuildNote): readonly string[] {
    switch (note.kind) {
        case "flowEndsFromDifferentSides":
            return [note.id, ...note.ends];
        case "addedAtSamePlace":
            return note.ids;
        case "drawnApartFromContainer":
            return [note.id, ...note.containers];
        case "restoredWithoutConnections":
            return [note.id, ...note.connections];
        case "frameDiffers":
            return [];
    }
}
