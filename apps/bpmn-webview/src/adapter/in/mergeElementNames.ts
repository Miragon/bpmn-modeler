/** How a merge pane reaches the names its canvas knows, once diagram-js built them. */
export interface MergeElementNamesConfig {
    attach(names: MergeElementNames): void;
}

interface BusinessObject {
    readonly id?: unknown;
    readonly name?: unknown;
}

interface RegistryElement {
    readonly businessObject?: BusinessObject;
    readonly source?: { readonly businessObject?: BusinessObject };
    readonly target?: { readonly businessObject?: BusinessObject };
}

interface ElementRegistry {
    get(id: string): RegistryElement | undefined;
}

/**
 * What this canvas knows to name an element the host names by id: its name,
 * and for a connection the BPMN ids of its ends. Nothing where this version
 * lacks the element.
 */
export class MergeElementNames {
    static $inject = ["elementRegistry", "mergeElementNamesConfig"];

    constructor(
        private readonly registry: ElementRegistry,
        config: MergeElementNamesConfig,
    ) {
        config.attach(this);
    }

    nameOf(id: string): string | undefined {
        const name = this.registry.get(id)?.businessObject?.name;
        return typeof name === "string" && name.trim() !== "" ? name : undefined;
    }

    flowEndsOf(id: string): { readonly source: string; readonly target: string } | undefined {
        const element = this.registry.get(id);
        const source = element?.source?.businessObject?.id;
        const target = element?.target?.businessObject?.id;
        return typeof source === "string" && typeof target === "string"
            ? { source, target }
            : undefined;
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
