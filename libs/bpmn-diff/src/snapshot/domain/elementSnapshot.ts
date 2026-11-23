import type { SnapshotReference } from "./unitStructure";

export interface ElementSnapshot {
    readonly id: string;
    readonly type: string;
    /** The nearest enclosing unit, or the participant a process that is no unit is folded into. */
    readonly parent?: string;
    /** The object of the parent that holds the element, such as a lane set, when it has an id. */
    readonly container?: string;
    /** Every lane whose `flowNodeRef` lists the element, outermost first. */
    readonly lanes: readonly string[];
    /** Under the default unit rule, byte-identical to `elementXml`. */
    readonly xml: string;
    /** `xml` without the references the modeler derives: incoming, outgoing, flowNodeRef, boundaryEventRefs. */
    readonly content: string;
    /** The attributes the unit's start tag in `xml` writes, by name, a reference as its target's id. */
    readonly attributes: Readonly<Record<string, string>>;
    /** Every reference of the unit's own subtree to another unit, derived ones left out. */
    readonly references: readonly SnapshotReference[];
    /** Ids of the elements inside the unit that are no units themselves, such as data inputs and event definitions. */
    readonly parts: readonly string[];
    /** Canonical text of the diagram elements that draw the unit; `undefined` when nothing does. */
    readonly layout?: string;
    /** The `bpmnElement` id of the plane holding the unit's first shape or edge; `undefined` when none does. */
    readonly plane?: string;
    /** Canonical text of the bounds of the shapes that draw the unit, without labels or attributes; `undefined` when no shape does. */
    readonly place?: string;
}
