/** How a merge pane reaches the names its canvas knows, once diagram-js built them. */
export interface MergeElementNamesConfig {
    attach(names: MergeElementNames): void;
}

interface ElementRegistry {
    get(id: string): { businessObject?: { name?: unknown } } | undefined;
}

/**
 * The names a merge pane shows for elements the host names by id: the
 * element's name on this canvas, or its id where it has none or this
 * version lacks it.
 */
export class MergeElementNames {
    static $inject = ["elementRegistry", "mergeElementNamesConfig"];

    constructor(
        private readonly registry: ElementRegistry,
        config: MergeElementNamesConfig,
    ) {
        config.attach(this);
    }

    nameOf(id: string): string {
        const name = this.registry.get(id)?.businessObject?.name;
        return typeof name === "string" && name.trim() !== "" ? name : id;
    }
}

/** The merge pane's names, which hand themselves to `config` once the pane's canvas exists. */
export function createMergeElementNamesModule(config: MergeElementNamesConfig) {
    return {
        __init__: ["mergeElementNames"],
        mergeElementNames: ["type", MergeElementNames],
        mergeElementNamesConfig: ["value", config],
    };
}
