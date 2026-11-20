import type { DiffSide } from "@miragon/bpmn-modeler-types";

/** The diff side the preview URL's `?mode=diff-before|diff-after` asks for. */
export function previewDiffSide(search: string): DiffSide | undefined {
    const mode = new URLSearchParams(search).get("mode");
    return mode === "diff-before" ? "before" : mode === "diff-after" ? "after" : undefined;
}
