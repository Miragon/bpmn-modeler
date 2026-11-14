const COMPARE_SEPARATOR = " ↔ ";

/** Joins the element to the files in an element XML diff's title, which names no diagram diff. */
export const ELEMENT_XML_TITLE_INFIX = " (XML): ";

/** The title of a `compare-files` diff tab, the same one VS Code gives `vscode.diff(a, b)`. */
export function compareTabLabel(leftBasename: string, rightBasename: string): string {
    return `${leftBasename}${COMPARE_SEPARATOR}${rightBasename}`;
}

/**
 * Whether a diff tab's label names the file `basename`: an SCM label
 * (`"x.bpmn (Working Tree)"`, `"x.bpmn (HEAD~1 ↔ HEAD)"`) or either side of a
 * compare label (`"a.bpmn ↔ b.bpmn"`). A compare label naming other files
 * does not claim this one.
 */
export function diffTabLabelNamesFile(label: string, basename: string): boolean {
    if (label.includes(ELEMENT_XML_TITLE_INFIX)) {
        return false;
    }
    if (label.startsWith(`${basename} (`)) {
        return true;
    }
    const sides = label.split(COMPARE_SEPARATOR);
    return sides.length === 2 && sides.includes(basename);
}
