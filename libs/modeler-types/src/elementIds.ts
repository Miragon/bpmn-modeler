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
    readonly eventDefinitionQualifier?: "off" | "optional" | "required";
}

/** IDs follow names only when the user opts in: renaming an ID can break references in other files. */
export const DEFAULT_ELEMENT_IDS_FOLLOW_NAME = false;

/** The element ID options a surface applies live. */
export interface ElementIdSettings {
    /** Rename an ID that is still random or generated whenever its element's name or type changes. */
    readonly followName: boolean;
}

/** `unsupported` comes from a surface that cannot change IDs, such as View mode. */
export type ElementIdReviewStatus = "opened" | "unsupported";

export interface ElementIdReviewOutcome {
    readonly status: ElementIdReviewStatus;
}
