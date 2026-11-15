import type { MergeSide } from "@miragon/bpmn-modeler-types";

const SIDE_INFIX = /\.(current|incoming)(\.[^.]+)$/;

/**
 * The name a merge pane's document carries: the side before the extension
 * (`order.bpmn` → `order.current.bpmn`). VS Code labels a restored merge tab
 * from these names, so that label never names the working file, and the
 * custom editor's `*.bpmn` pattern still matches.
 */
export function mergePaneBasename(fileName: string, side: MergeSide): string {
    const extensionStart = fileName.lastIndexOf(".");
    if (extensionStart < 0) {
        return `${fileName}.${side}`;
    }
    return `${fileName.slice(0, extensionStart)}.${side}${fileName.slice(extensionStart)}`;
}

/** The working file a merge pane's name was built from, or the name itself when it is no pane's. */
export function workingFileNameOfMergePane(paneBasename: string): string {
    return paneBasename.replace(SIDE_INFIX, "$2");
}
