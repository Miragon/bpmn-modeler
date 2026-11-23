import {
    type MergeSide,
    type MergeSideCaption,
    writeConflictMarkers,
} from "@miragon/bpmn-modeler-types/domain";

import { mergeSideName } from "./diffTabLabel";

/** Why a host without a merge editor opens no element XML merge, as the router and the log say it. */
export const NO_ELEMENT_XML_MERGE_EDITOR = "the host offers no XML merge editor";

/** The log line of an element XML merge a pane asked for that did not open. */
export function elementXmlMergeNotOpened(elementId: string, reason: string): string {
    return `Merge XML of ${elementId} not opened: ${reason}.`;
}

/** The texts of one element that base, current and incoming hold, which its merge editor shows. */
interface ElementXmlMergeTexts {
    readonly base: string;
    readonly current: string;
    readonly incoming: string;
}

/** What a host's merge editor opens for one element. */
export interface ElementXmlMergeRequest {
    readonly key: string;
    readonly elementId: string;
    readonly labels: Readonly<Record<MergeSide, string>>;
    readonly base: string;
    readonly current: string;
    readonly incoming: string;
    /** The result's text when the editor opens; a line starting with `<<<<<<<` makes the editor merge it. */
    readonly start: string;
}

export type ElementXmlMergeOpening =
    | { readonly kind: "focus"; readonly key: string }
    | { readonly kind: "open"; readonly request: ElementXmlMergeRequest };

/** A merge the user finished with a text, which the merge takes or refuses. */
export interface WrittenElementXmlMerge {
    readonly kind: "written";
    readonly elementId: string;
    readonly side: MergeSide;
    readonly text: string;
}

/** A merge the user closed without a save. */
interface DiscardedElementXmlMerge {
    readonly kind: "discarded";
    readonly elementId: string;
    readonly side: MergeSide;
    /** The merge made the pick of `side` itself, so closing it without a save takes that pick back. */
    readonly takesBackPick?: true;
}

export type ElementXmlMergeFinish = DiscardedElementXmlMerge | WrittenElementXmlMerge;

export interface ElementXmlMergeOpen {
    readonly elementId: string;
    /** The side of the user's pick the merge replaces. */
    readonly side: MergeSide;
    readonly texts: ElementXmlMergeTexts;
    readonly captions: Readonly<Record<MergeSide, MergeSideCaption>>;
    /** Edit again: start from the text refused last. */
    readonly resume?: boolean;
    /** The accepted text of an element already merged by hand. */
    readonly handMergedText?: string;
    /** The merge made the pick of `side` itself, on an element no pick decided before. */
    readonly startedByPick?: boolean;
}

interface OpenEditor {
    readonly elementId: string;
    readonly side: MergeSide;
    readonly startedByPick: boolean;
}

interface RefusedText {
    readonly side: MergeSide;
    readonly text: string;
}

/**
 * The element XML merge editors of one merge view: at most one per element,
 * each finished by the text the user wrote or, without one, discarded. A text
 * the merge refused stays for Edit again until the decisions change. An
 * editor that made its element's pick itself takes it back when discarded,
 * so closing it leaves the element as it was.
 */
export class ElementXmlMerges {
    private readonly openByKey = new Map<string, OpenEditor>();
    private readonly refusedByElement = new Map<string, RefusedText>();
    private openings = 0;

    constructor(private readonly keyPrefix: string) {}

    open(element: ElementXmlMergeOpen): ElementXmlMergeOpening {
        const openKey = [...this.openByKey].find(
            ([, editor]) => editor.elementId === element.elementId,
        )?.[0];
        if (openKey !== undefined) return { kind: "focus", key: openKey };
        this.openings += 1;
        const key = `${this.keyPrefix}:${this.openings}`;
        this.openByKey.set(key, {
            elementId: element.elementId,
            side: element.side,
            startedByPick: element.startedByPick === true,
        });
        const labels = elementXmlMergeLabels(element.captions);
        return {
            kind: "open",
            request: {
                key,
                elementId: element.elementId,
                labels,
                ...element.texts,
                start: this.startOf(element, labels),
            },
        };
    }

    /** Ends the editor `key`: what the user wrote is the merge's answer, no write a discard. */
    finish(key: string, written?: string): ElementXmlMergeFinish | undefined {
        const editor = this.openByKey.get(key);
        if (editor === undefined) return undefined;
        this.openByKey.delete(key);
        const { elementId, side, startedByPick } = editor;
        if (written !== undefined) return { kind: "written", elementId, side, text: written };
        return startedByPick
            ? { kind: "discarded", elementId, side, takesBackPick: true }
            : { kind: "discarded", elementId, side };
    }

    /** The merge's answer to a written text: a refused one stays for Edit again, a taken one replaces it. */
    answered(finish: WrittenElementXmlMerge, outcome: { readonly applied: boolean }): void {
        if (outcome.applied) this.refusedByElement.delete(finish.elementId);
        else this.refusedByElement.set(finish.elementId, { side: finish.side, text: finish.text });
    }

    /** A pick or an undo changed the decisions a refused text was checked against. */
    forgetRefusals(): void {
        this.refusedByElement.clear();
    }

    get openKeys(): readonly string[] {
        return [...this.openByKey.keys()];
    }

    private startOf(
        element: ElementXmlMergeOpen,
        labels: Readonly<Record<MergeSide, string>>,
    ): string {
        const refused = this.refusedByElement.get(element.elementId);
        if (element.resume && refused?.side === element.side) return refused.text;
        if (element.handMergedText !== undefined) return element.handMergedText;
        return writeConflictMarkers(element.texts, labels);
    }
}

/** The editor's names of both sides, as the merge tab names them. */
export function elementXmlMergeLabels(
    captions: Readonly<Record<MergeSide, MergeSideCaption>>,
): Readonly<Record<MergeSide, string>> {
    return { current: mergeSideName(captions.current), incoming: mergeSideName(captions.incoming) };
}
