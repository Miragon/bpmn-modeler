import { BpmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { MOCK_BPMN_XML, MOCK_NEUTRAL_BPMN_XML } from "../../../__fixtures__/mock-bpmn";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "../../../__fixtures__/mock-diff";
import type { PreviewMode } from "./previewMode";

const DOCUMENTS: Readonly<Record<PreviewMode, () => BpmnFileQuery>> = {
    modeler: () => new BpmnFileQuery(MOCK_BPMN_XML, "c7"),
    // Untagged model: no engine, so the webview opens it in Design.
    neutral: () => new BpmnFileQuery(MOCK_NEUTRAL_BPMN_XML, undefined),
    "diff-before": () => new BpmnFileQuery(MOCK_DIFF_BEFORE_XML, "c7", "viewer"),
    "diff-after": () => new BpmnFileQuery(MOCK_DIFF_AFTER_XML, "c7", "viewer"),
    "merge-current": () => new BpmnFileQuery(MOCK_DIFF_BEFORE_XML, "c7", "merge"),
    "merge-incoming": () => new BpmnFileQuery(MOCK_DIFF_AFTER_XML, "c7", "merge"),
};

export function previewDocument(mode: PreviewMode): BpmnFileQuery {
    return DOCUMENTS[mode]();
}
