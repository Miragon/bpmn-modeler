const COMPARE_SEPARATOR = " ↔ ";

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
    if (label.startsWith(`${basename} (`)) {
        return true;
    }
    const sides = label.split(COMPARE_SEPARATOR);
    return sides.length === 2 && sides.includes(basename);
}
