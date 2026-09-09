/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Verbatim: resolve a moddle location to the standard-bpmn entry id, so
 * render-agnostic consumers (linting) can stay decoupled from the panel.
 */
import { isArray } from "min-dash";

export function getBpmnEntryId(element: any, path: Array<string | number>): string | null {
    if (!element || !isArray(path) || !path.length) {
        return null;
    }

    const property = path[path.length - 1];

    // element documentation (DocumentationProps): the group renders it as the
    // always-present `documentation` entry.
    if (property === "documentation") {
        return "documentation";
    }

    return null;
}
