import type { ApplyMergeStatesQuery } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import { mockMergeStates } from "../../../__fixtures__/mock-merge";
import { mergeXmlStartStates } from "./mergeXmlPreview";

/** The recorded states a merge pane gets once it is ready. */
export function mergeStatesFor(side: DiffSide, search: string): ApplyMergeStatesQuery {
    return mergeXmlStartStates(side, search) ?? mockMergeStates(side);
}
