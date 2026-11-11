/**
 * How an ID generated from an element's name is spelled: `Activity_ProcessData`
 * (bpmn-js' own prefixes), `ProcessDataTask` (as the Camunda Modeler plugin
 * rename-technical-ids writes it) or `activity_process_data`.
 */
export type ElementIdStyle = "typePrefix" | "typeSuffix" | "snakeCase";

/**
 * Every style a host offers and the modeler accepts. Not `as const`: the
 * published package re-exports the union through `BpmnModelerSetting`, and its
 * declaration roll-up cannot follow a type derived from `as const`.
 */
export const ELEMENT_ID_STYLES: readonly ElementIdStyle[] = [
    "typePrefix",
    "typeSuffix",
    "snakeCase",
];

export const DEFAULT_ELEMENT_ID_STYLE: ElementIdStyle = "typePrefix";

/** IDs follow names only when the user opts in: renaming an ID can break references in other files. */
export const DEFAULT_ELEMENT_IDS_FOLLOW_NAME = false;

/** The element ID options a surface applies live. */
export interface ElementIdSettings {
    readonly style: ElementIdStyle;
    /** Rename an ID that is still random or generated whenever its element's name changes. */
    readonly followName: boolean;
}

/** `unsupported` comes from a surface that cannot change IDs, such as View mode. */
export type ElementIdReviewStatus = "opened" | "unsupported";

export interface ElementIdReviewOutcome {
    readonly status: ElementIdReviewStatus;
}
