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

/** `&modeSwitch=none` plays a host that offers no mode switch, as IntelliJ does. */
function offersModeSwitch(search: string): boolean {
    return new URLSearchParams(search).get("modeSwitch") !== "none";
}

export function previewDocument(mode: PreviewMode, search: string): BpmnFileQuery {
    const pane = paneOf(mode);
    if (pane) {
        return new BpmnFileQuery(PANE_XML[pane.side], "c7", PANE_VIEWER_MODE[pane.kind]);
    }
    // Untagged model: no engine, so the webview opens it in Design.
    const [xml, engine] =
        mode === "neutral" ? [MOCK_NEUTRAL_BPMN_XML, undefined] : [MOCK_BPMN_XML, "c7" as const];
    return new BpmnFileQuery(
        xml,
        engine,
        "modeler",
        0,
        undefined,
        undefined,
        undefined,
        offersModeSwitch(search),
    );
}
