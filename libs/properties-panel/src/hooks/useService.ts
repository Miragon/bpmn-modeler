/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Verbatim: resolve a DI service from the panel context. `strict` is forwarded
 * to `injector.get(type, strict)` — pass `false` for services a readonly viewer
 * never registers (`modeling`, `commandStack`, `bpmnFactory`).
 */
import { useContext } from "@bpmn-io/properties-panel/preact/hooks";

import { PropertiesPanelContext } from "../context/PropertiesPanelContext";

export function useService(type: string, strict?: boolean): any {
    const { getService } = useContext(PropertiesPanelContext);

    return getService(type, strict);
}
