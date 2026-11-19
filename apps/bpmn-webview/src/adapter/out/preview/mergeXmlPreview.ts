import type { ApplyMergeStatesQuery } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import {
    mockMergeXmlAnswerOf,
    mockMergeXmlFinished,
    mockMergeXmlStates,
} from "../../../__fixtures__/mock-merge";
import type { PreviewPane } from "./previewMode";

function mergeXmlAnswerIn(search: string) {
    return mockMergeXmlAnswerOf(new URLSearchParams(search).get("mergeXml"));
}

/** With `&mergeXml=`, a merge pane starts with Merge XML offered; undefined without it. */
export function mergeXmlStartStates(
    side: DiffSide,
    search: string,
): ApplyMergeStatesQuery | undefined {
    return mergeXmlAnswerIn(search) ? mockMergeXmlStates(side) : undefined;
}

/**
 * No merge editor: with `&mergeXml=`, a pane gets the states a finished merge
 * would send; undefined without it or outside a pane.
 */
export function finishedMergeXml(
    pane: PreviewPane | undefined,
    search: string,
): ApplyMergeStatesQuery | undefined {
    const answer = mergeXmlAnswerIn(search);
    return answer && pane ? mockMergeXmlFinished(pane.side, answer) : undefined;
}
