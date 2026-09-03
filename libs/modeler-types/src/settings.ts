export interface BpmnModelerSetting {
    readonly alignToOrigin: boolean;
    readonly showTransactionBoundaries: boolean;
    readonly colorTheme: "automatic" | "light";
    // BPMN type strings to pin at the top of the append menu palette (max 6).
    readonly favouriteBpmnElements?: string[];
    /**
     * Whether every `bpmn:Activity` (task, call activity, collapsed
     * sub-process) shows resize handles. Off by default — bpmn-js pins those
     * shapes to 100x80 and BPMN attaches no meaning to element size, so the
     * handles are a hand-layout affordance rather than a default.
     */
    readonly resizableActivities?: boolean;
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
