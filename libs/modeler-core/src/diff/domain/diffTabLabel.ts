import type { MergeSide, MergeSideCaption } from "@miragon/bpmn-modeler-types/domain";

import { inPaneOrder } from "./mergePaneSide";
import { MERGE_SIDE_WORDS, mergeSideName } from "./mergeSideNames";

const COMPARE_SEPARATOR = " ↔ ";

/** Joins the element to the files in an element XML diff's title, which names no diagram diff. */
export const ELEMENT_XML_TITLE_INFIX = " (XML): ";

/** Joins the working file to the sides in a merge tab's title, which names no file to the label heuristic. */
export const MERGE_TITLE_INFIX = " (Merge: ";

/** A merge tab's title: the working file and each side's branch, commit or position. */
export function mergeTabLabel(
    fileName: string,
    captions: Record<MergeSide, MergeSideCaption>,
): string {
    return `${fileName}${MERGE_TITLE_INFIX}${inPaneOrder(captions).map(mergeSideName).join(COMPARE_SEPARATOR)})`;
}

/**
 * The title of a merge view's element XML diff: the working file and the
 * sides by position, since the panes' documents are its Git stages.
 */
export function mergeElementXmlDiffTitle(elementId: string, fileName: string): string {
    return `${elementId}${ELEMENT_XML_TITLE_INFIX}${fileName} (${inPaneOrder(MERGE_SIDE_WORDS).join(COMPARE_SEPARATOR)})`;
}

/** The title of a `compare-files` diff tab, the same one VS Code gives `vscode.diff(a, b)`. */
export function compareTabLabel(leftBasename: string, rightBasename: string): string {
    return `${leftBasename}${COMPARE_SEPARATOR}${rightBasename}`;
}

/**
 * Whether a diff tab's label names the file `basename`: an SCM label
 * (`"x.bpmn (Working Tree)"`, `"x.bpmn (HEAD~1 ↔ HEAD)"`) or either side of a
 * compare label (`"a.bpmn ↔ b.bpmn"`). A compare label naming other files
 * does not claim this one, and neither does an element XML diff or a merge
 * tab: a merge view shows the file's Git stages, never the file itself.
 */
export function diffTabLabelNamesFile(label: string, basename: string): boolean {
    if (label.includes(ELEMENT_XML_TITLE_INFIX) || label.includes(MERGE_TITLE_INFIX)) {
        return false;
    }
    if (label.startsWith(`${basename} (`)) {
        return true;
    }
    const sides = label.split(COMPARE_SEPARATOR);
    return sides.length === 2 && sides.includes(basename);
}

/**
 * The title of a built merge result compared with one side: the working file
 * and the side, so, like a merge tab, it names no file to the label heuristic.
 */
export function mergeResultTabLabel(fileName: string, against: MergeSide): string {
    return `${fileName}${MERGE_TITLE_INFIX}${MERGE_SIDE_WORDS[against]}${COMPARE_SEPARATOR}Result)`;
}
