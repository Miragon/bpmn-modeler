import { type MergeBuildNote, createButton, createElement } from "@miragon/bpmn-modeler-types";

import { MERGE_MENU_TEXTS } from "../../domain/mergeBarTexts";
import { buildNoteText } from "../../domain/mergeBuildNoteTexts";
import { MERGE_BUILD_TEXTS } from "../../domain/mergeTexts";
import type { MergeTranslate } from "../../domain/mergeTranslate";
import { closeMergePopupOnDismiss } from "./mergePopupDismissal";

/** What the notes popover lists: the notes of the last build and the names of their elements. */
export interface MergeNotesState {
    readonly notes: readonly MergeBuildNote[];
    readonly nameOf: (elementId: string) => string;
}

/**
 * The notes of the last build in a popup below the right pane's "…" button,
 * each naming its elements as buttons that show them. Escape and × close it
 * and give the focus back to "…"; a click outside closes it too.
 */
export class MergeNotesPopover {
    readonly element = createElement("div", "merge-notes");
    private readonly title = createElement("span", "merge-notes__title");
    private readonly closeButton: HTMLButtonElement;
    private readonly list = createElement("ul", "merge-notes__list");
    private state?: MergeNotesState;
    private shownNotes?: string;

    constructor(
        private readonly translate: MergeTranslate,
        private readonly onSelect: (elementId: string) => void,
        private readonly opener: HTMLButtonElement,
        private readonly onClosed: () => void,
    ) {
        this.element.setAttribute("role", "dialog");
        this.element.hidden = true;
        this.closeButton = createButton("merge-notes__close", () => this.close(true), "×");
        const head = createElement("div", "merge-notes__head");
        head.append(this.title, this.closeButton);
        this.element.append(head, this.list);
        closeMergePopupOnDismiss(this.element, opener, (returnFocus) => this.close(returnFocus));
        this.render();
    }

    isOpen(): boolean {
        return !this.element.hidden;
    }

    update(state: MergeNotesState): void {
        this.state = state;
        if (state.notes.length === 0) this.close(false);
        this.render();
    }

    open(): void {
        this.element.hidden = false;
        this.closeButton.focus();
    }

    close(returnFocus: boolean): void {
        if (!this.isOpen()) return;
        this.element.hidden = true;
        if (returnFocus) this.opener.focus();
        this.onClosed();
    }

    /** Writes every word again, after an update or a change of language. */
    render(): void {
        const notesName = this.translate(MERGE_BUILD_TEXTS.notes);
        this.element.setAttribute("aria-label", notesName);
        this.title.textContent = notesName;
        this.closeButton.setAttribute("aria-label", this.translate(MERGE_MENU_TEXTS.close));
        if (!this.state) return;
        const { notes, nameOf } = this.state;
        const texts = notes.map((note) => buildNoteText(note, nameOf, this.translate));
        // Rebuilt only when the notes or their words change, so a repaint leaves the focused button in place.
        const shown = JSON.stringify([notes, texts]);
        if (shown === this.shownNotes) return;
        this.shownNotes = shown;
        this.list.replaceChildren(
            ...notes.map((note, index) => {
                const item = createElement("li", "merge-notes__note");
                item.append(
                    createElement("span", "merge-notes__text", texts[index]),
                    ...note.named.map((id) =>
                        createButton("merge-notes__element", () => this.onSelect(id), nameOf(id)),
                    ),
                );
                return item;
            }),
        );
    }
}
