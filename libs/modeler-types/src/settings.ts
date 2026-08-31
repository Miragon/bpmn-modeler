export interface BpmnModelerSetting {
    readonly alignToOrigin: boolean;
    readonly showTransactionBoundaries: boolean;
    readonly colorTheme: "automatic" | "light";
    // BPMN type strings to pin at the top of the append menu palette (max 6).
    readonly favouriteBpmnElements?: string[];
    /**
     * Whether an external label whose authored DI bounds are wider than
     * bpmn-js's own default is wrapped at that default instead of running onto
     * one long line. Off by default — it changes how existing diagrams look.
     */
    readonly compactExternalLabels?: boolean;
}

/**
 * Settings the DMN modeler honours. Deliberately leaner than
 * {@link BpmnModelerSetting}: the decision-table/DRD surfaces only react to the
 * shared `colorTheme` preference, so BPMN-only fields (alignToOrigin,
 * favouriteBpmnElements, …) are omitted rather than carried unused.
 */
export interface DmnModelerSetting {
    readonly colorTheme: "automatic" | "light";
}
