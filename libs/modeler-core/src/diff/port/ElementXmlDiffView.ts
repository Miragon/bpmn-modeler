/** One element's XML from both sides of a diagram diff, ready to show as a text diff. */
export interface ElementXmlDiff {
    /** The key of the diagram diff's session. */
    readonly diffKey: string;
    readonly elementId: string;
    readonly title: string;
    /** Empty when the element exists only on the other side. */
    readonly before: string;
    readonly after: string;
}

/** Where a host shows the element XML diff of a diagram diff; at most one per diagram diff. */
export interface ElementXmlDiffView {
    /** Opens it below the diagram diff, or replaces what the open one shows; the diagram keeps focus. */
    show(diff: ElementXmlDiff): Promise<void>;
    /** Replaces what the open one shows; opens nothing when the user closed it. */
    refresh(diff: ElementXmlDiff): Promise<void>;
    /** Closes it and releases its documents. */
    close(diffKey: string): Promise<void>;
}
