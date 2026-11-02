/** The status items the core publishes. A host decides only where each slot goes. */
export type StatusSlot = "elementTemplates" | "engineVersion" | "bpmnlint" | "deploymentTarget";

export type StatusIcon =
    "loading" | "check" | "engine" | "warning" | "shield" | "off" | "info" | "dot";

export type StatusTone = "neutral" | "success" | "attention" | "info" | "warning";

export type StatusAction = "changeEngineVersion" | "toggleLinting" | "deploymentMenu";

/** What one slot shows, built by the core; the host maps icon, tone and action onto its own UI. */
export interface StatusView {
    readonly text: string;
    readonly icon?: StatusIcon;
    readonly tooltip?: string;
    readonly tone: StatusTone;
    readonly action?: StatusAction;
    /** The host hides the view after a few seconds, unless the slot is shown or hidden again first. */
    readonly transient?: boolean;
}
