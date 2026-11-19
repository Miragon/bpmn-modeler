import {
    type MergeSide,
    type MergeSideCaption,
    writeConflictMarkers,
} from "@miragon/bpmn-modeler-types";

import { mergeSideName } from "./diffTabLabel";

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

export type ElementXmlMergeFinish =
    | { readonly kind: "discarded"; readonly elementId: string; readonly side: MergeSide }
    | {
          readonly kind: "written";
          readonly elementId: string;
          readonly side: MergeSide;
          readonly text: string;
      };

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
}

interface OpenEditor {
    readonly elementId: string;
    readonly side: MergeSide;
}

interface RefusedText {
    readonly side: MergeSide;
    readonly text: string;
}

/**
 * The element XML merge editors of one merge view: at most one per element,
 * each finished by the text the user wrote or, without one, discarded. A text
 * the merge refused stays for Edit again until the decisions change.
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
        this.openByKey.set(key, { elementId: element.elementId, side: element.side });
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
        return written === undefined
            ? { kind: "discarded", ...editor }
            : { kind: "written", ...editor, text: written };
    }

    refused(elementId: string, side: MergeSide, text: string): void {
        this.refusedByElement.set(elementId, { side, text });
    }

    accepted(elementId: string): void {
        this.refusedByElement.delete(elementId);
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
