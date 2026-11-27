import { BpmnPropertiesPanelModule } from "bpmn-js-properties-panel";
import { FlushableDebounceInputModule } from "@miragon/bpmn-modeler-properties-panel/debounceInput/flushableDebounceInput";

/**
 * The upstream panel the engine providers render in. The flushable
 * `debounceInput` follows it so it wins over the panel's own; it is not in the
 * shared panel modules, which would pull the upstream panel into engine-free surfaces.
 */
export const UpstreamPropertiesPanelModule = {
    __depends__: [BpmnPropertiesPanelModule, FlushableDebounceInputModule],
};
