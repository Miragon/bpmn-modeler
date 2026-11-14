/** Whether an event's ID names its event definition, such as `messageStartEvent_orderReceived`. */
export type EventDefinitionQualifierMode = "off" | "optional" | "required";

/** Every qualifier mode the rule takes. Not `as const`, like `COLOR_THEMES`. */
export const EVENT_DEFINITION_QUALIFIER_MODES: readonly EventDefinitionQualifierMode[] = [
    "off",
    "optional",
    "required",
];

/**
 * The options of the bpmnlint rule `@miragon/rules/element-id-naming`, as a
 * `.bpmnlintrc` sets them. IDs generated from names follow this convention, so
 * they never break the rule; without options, its Miragon defaults apply.
 */
export interface ElementIdConventionOptions {
    /** A prefix per BPMN type, merged over the rule's defaults; `false` leaves a type out. */
    readonly prefixes?: Readonly<Record<string, string | false | null>>;
    /** The case of the name after the prefix: `camelCase` (the default), `PascalCase`, `snake_case`, `kebab-case` or `any`. */
    readonly case?: string;
    readonly eventDefinitionQualifier?: EventDefinitionQualifierMode;
}

/** IDs follow names only when the user opts in: renaming an ID can break references in other files. */
export const DEFAULT_ELEMENT_IDS_FOLLOW_NAME = false;

/** The element ID options a surface applies live. */
export interface ElementIdSettings {
    /** Rename an ID that is still random or generated whenever its element's name or type changes. */
    readonly followName: boolean;
}

/** The kinds the review groups IDs by. */
export type ElementIdKind =
    "process" | "participant" | "lane" | "activity" | "event" | "gateway" | "flow" | "other";

/** The review's groups in the order a host's panel lists them, with their labels. */
export const ELEMENT_ID_GROUPS: readonly {
    readonly kind: ElementIdKind;
    readonly label: string;
}[] = [
    { kind: "process", label: "Processes" },
    { kind: "participant", label: "Pools" },
    { kind: "lane", label: "Lanes" },
    { kind: "activity", label: "Activities" },
    { kind: "event", label: "Events" },
    { kind: "gateway", label: "Gateways" },
    { kind: "flow", label: "Flows" },
    { kind: "other", label: "Other elements" },
];

/**
 * `matches`: the ID already follows the name. `unchecked`: the user keeps the
 * current ID. `skipped`: the name yields no ID.
 */
export type ElementIdRowStatus = "rename" | "matches" | "unchecked" | "skipped";

/** Whether a row's ID changes once it is checked; only these rows have a checkbox. */
export function isChangingStatus(status: ElementIdRowStatus): boolean {
    return status === "rename" || status === "unchecked";
}

/** One row of the review, for a host that shows the review in its own panel. */
export interface ElementIdRow {
    /** The current ID, which also identifies the row. */
    readonly id: string;
    readonly name: string;
    /** The BPMN type, such as `bpmn:ServiceTask`. */
    readonly type: string;
    readonly kind: ElementIdKind;
    readonly status: ElementIdRowStatus;
    /** The ID the element gets, or would get if checked; absent when skipped. */
    readonly newId?: string;
    /** A counter was added because another element claims the plain ID. */
    readonly clash: boolean;
    /** The diagram element to reveal for the row: a pool for its process. */
    readonly shownId: string;
}

/** The review's rows and the IDs it leaves unchecked. */
export interface ElementIdProposals {
    readonly rows: readonly ElementIdRow[];
    readonly unchecked: readonly string[];
}
