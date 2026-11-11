import type { DiffCounts } from "@miragon/bpmn-modeler-diff";

/**
 * What changed in one decision table that both versions contain.
 *
 * Every list holds ids as they appear in the DMN XML. A cell whose entry got a
 * new id is listed under both ids, so each side finds the cell it renders.
 */
export interface DecisionTableChanges {
    /** Input and output clause ids. */
    readonly columns: {
        readonly added: readonly string[];
        readonly removed: readonly string[];
        readonly changed: readonly string[];
    };
    /**
     * Rule ids. `moved` lists the rules whose position among the rules both
     * versions share changed; with the FIRST or PRIORITY hit policy that changes
     * the result.
     */
    readonly rules: {
        readonly added: readonly string[];
        readonly removed: readonly string[];
        readonly changed: readonly string[];
        readonly moved: readonly string[];
    };
    /** Input and output entries whose expression changed, in columns both versions share. */
    readonly cells: readonly string[];
    /** Rules whose annotation changed. */
    readonly annotations: readonly string[];
    /** Table attributes that changed, such as `hitPolicy` and `aggregation`. */
    readonly properties: readonly string[];
    /**
     * Added and removed count rules and columns, changed counts rules and
     * columns plus one for the table attributes, and `layoutChanged` the moved
     * rules.
     */
    readonly counts: DiffCounts;
    /**
     * The table id (for its attributes), then columns left to right, then rules
     * top to bottom: the order a stepper walks. Removed columns and rules sit
     * next to the neighbour they followed in the before version.
     */
    readonly navigationOrder: readonly string[];
}

/**
 * Serializable result of comparing two DMN documents.
 *
 * The DRD lists hold the ids of decisions, input data, business knowledge
 * models, knowledge sources, text annotations, associations and requirements,
 * each ordered as the user reads the DRD: top to bottom, then left to right.
 * `navigationOrder` merges them; a removed element takes its position from the
 * before version.
 */
export interface DmnDiffResult {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly string[];
    readonly layoutChanged: readonly string[];
    readonly counts: DiffCounts;
    readonly navigationOrder: readonly string[];
    /** Decision id → changes, for each decision whose table changed and exists in both versions. */
    readonly tables: Readonly<Record<string, DecisionTableChanges>>;
    /** Decisions and business knowledge models whose literal expression changed. */
    readonly expressions: readonly string[];
}
