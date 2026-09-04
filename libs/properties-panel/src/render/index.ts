/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Verbatim module wiring: the panel renderer plus its command + input/popup
 * dependencies. `Commands` is the optionalised `cmd` module (viewer-safe).
 */
import PropertiesPanelRenderer from "./PropertiesPanelRenderer";

import Commands from "../cmd";
import { DebounceInputModule, FeelPopupModule } from "@bpmn-io/properties-panel";

export default {
    __depends__: [Commands, DebounceInputModule, FeelPopupModule],
    __init__: ["propertiesPanel"],
    propertiesPanel: ["type", PropertiesPanelRenderer],
};
