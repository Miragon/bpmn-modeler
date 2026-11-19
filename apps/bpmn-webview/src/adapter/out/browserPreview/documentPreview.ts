import { BpmnFileQuery } from "@miragon/bpmn-modeler-shared";
import type { BpmnViewerMode, DiffSide } from "@miragon/bpmn-modeler-types";

import { MOCK_BPMN_XML, MOCK_NEUTRAL_BPMN_XML } from "../../../__fixtures__/mock-bpmn";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "../../../__fixtures__/mock-diff";
import { paneOf, type PreviewMode, type PreviewPane } from "./previewMode";

const PANE_XML: Readonly<Record<DiffSide, string>> = {
    before: MOCK_DIFF_BEFORE_XML,
    after: MOCK_DIFF_AFTER_XML,
};

const PANE_VIEWER_MODE: Readonly<Record<PreviewPane["kind"], BpmnViewerMode>> = {
    diff: "viewer",
    merge: "merge",
};

export function previewDocument(mode: PreviewMode): BpmnFileQuery {
    const pane = paneOf(mode);
    if (pane) {
        return new BpmnFileQuery(PANE_XML[pane.side], "c7", PANE_VIEWER_MODE[pane.kind]);
    }
    // Untagged model: no engine, so the webview opens it in Design.
    return mode === "neutral"
        ? new BpmnFileQuery(MOCK_NEUTRAL_BPMN_XML, undefined)
        : new BpmnFileQuery(MOCK_BPMN_XML, "c7");
}
