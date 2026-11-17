import type { MergeSide } from "@miragon/bpmn-modeler-types";

/** A document a merge view or a result comparison shows: a Git stage, or the built result as it was. */
export type MergePaneName = MergeSide | "result";

/**
 * The name a merge pane's document carries: the side before the extension
 * (`order.bpmn` → `order.current.bpmn`). VS Code labels a restored merge tab
 * from these names, so that label never names the working file, and the
 * custom editor's `*.bpmn` pattern still matches.
 */
export function mergePaneBasename(fileName: string, side: MergePaneName): string {
    const extensionStart = fileName.lastIndexOf(".");
    if (extensionStart < 0) {
        return `${fileName}.${side}`;
    }
    return `${fileName.slice(0, extensionStart)}.${side}${fileName.slice(extensionStart)}`;
}
