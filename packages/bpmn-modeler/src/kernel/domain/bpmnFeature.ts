/**
 * @experimental One piece of a BPMN surface: what it adds to bpmn-js, as the
 * built-in features and third-party plugins alike describe it.
 */
export interface BpmnFeature {
    /** Names the feature in errors and warnings. */
    readonly id: string;
    /** didi modules, in the order bpmn-js should register them. */
    readonly modules: readonly unknown[];
    /** Merged by prefix: a later feature replaces an earlier one's package. */
    readonly moddleExtensions?: Readonly<Record<string, object>>;
    /**
     * Merged into the bpmn-js options: plain objects key by key, any other value
     * replaces. `undefined` leaves the earlier value, so no later feature unsets a key.
     */
    readonly config?: Readonly<Record<string, unknown>>;
    /**
     * DI names that another feature or the kernel must provide. The base's own
     * services (`canvas`, `modeling`, `copyPaste`, …) are always there and are
     * not listed: naming one here fails, because the check reads only the features.
     */
    readonly requires?: readonly string[];
}
