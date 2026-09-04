/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Verbatim: the shared preact context carrying the selected element, injector,
 * and the `getService(type, strict)` bridge the `useService` hook reads.
 */
import { createContext } from "@bpmn-io/properties-panel/preact";

export interface PropertiesPanelContextValue {
    selectedElement: unknown;
    injector: unknown;
    getService(type: string, strict?: boolean): unknown;
}

export const PropertiesPanelContext = createContext<PropertiesPanelContextValue>({
    selectedElement: null,
    injector: null,
    getService() {
        return null;
    },
});
