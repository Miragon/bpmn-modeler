/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Module wiring: the panel renderer plus its command + input/popup
 * dependencies. `Commands` is the optionalised `cmd` module (viewer-safe); the
 * input debounce is the flushable one, so a save can apply a typed value.
 */
import PropertiesPanelRenderer from "./PropertiesPanelRenderer";

import Commands from "../cmd";
import { FlushableDebounceInputModule } from "../debounceInput/flushableDebounceInput";
import { FeelPopupModule } from "@bpmn-io/properties-panel";

export default {
    __depends__: [Commands, FlushableDebounceInputModule, FeelPopupModule],
    __init__: ["propertiesPanel"],
    propertiesPanel: ["type", PropertiesPanelRenderer],
};
