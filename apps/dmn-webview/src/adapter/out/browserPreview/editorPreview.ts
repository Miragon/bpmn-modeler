import {
    DmnFileQuery,
    DmnModelerSettingQuery,
    PropertiesPanelStateQuery,
    TakeFocusQuery,
} from "@miragon/bpmn-modeler-shared";

import { SAMPLE_DECISION_XML } from "../../../__fixtures__/sampleDecision";

export function previewDocument(): DmnFileQuery {
    return new DmnFileQuery(SAMPLE_DECISION_XML);
}

export function previewPanelState(): PropertiesPanelStateQuery {
    return new PropertiesPanelStateQuery(true);
}

/** Follows the preview's VS Code theme class on the body. */
export function previewModelerSettings(): DmnModelerSettingQuery {
    return new DmnModelerSettingQuery({ colorTheme: "automatic" });
}

/** The preview page is always the active editor. */
export function previewFocus(): TakeFocusQuery {
    return new TakeFocusQuery();
}
