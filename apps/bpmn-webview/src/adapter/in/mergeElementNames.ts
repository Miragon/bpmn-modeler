import { TranslateModule } from "@miragon/bpmn-modeler-i18n";

import { mergeElementLabel, type MergeElementNaming } from "../../domain/mergeElementLabel";
import type { MergeTranslate } from "../../domain/mergeTexts";

/** How a merge pane reaches the names its canvas knows, once diagram-js built them. */
export interface MergeElementNamesConfig {
    attach(names: MergeElementNames): void;
}

interface CanvasElement {
    readonly id: string;
    readonly businessObject?: { name?: unknown };
    readonly waypoints?: readonly unknown[];
    readonly source?: CanvasElement;
    readonly target?: CanvasElement;
}

interface ElementRegistry {
    get(id: string): CanvasElement | undefined;
}

/**
 * The names a merge pane shows for elements the host names by id, as this
 * canvas draws them ({@link mergeElementLabel}); an element this version
 * lacks keeps its id.
 */
export class MergeElementNames {
    static $inject = ["elementRegistry", "translate", "mergeElementNamesConfig"];

    constructor(
        private readonly registry: ElementRegistry,
        private readonly translate: MergeTranslate,
        config: MergeElementNamesConfig,
    ) {
        config.attach(this);
    }

    nameOf(id: string): string {
        const element = this.registry.get(id);
        return element === undefined ? id : mergeElementLabel(namingOf(element), this.translate);
    }
}

function namingOf(element: CanvasElement): MergeElementNaming {
    const name = element.businessObject?.name;
    const { source, target } = element;
    return {
        id: element.id,
        ...(typeof name === "string" ? { name } : {}),
        ...(element.waypoints !== undefined && source !== undefined && target !== undefined
            ? { flowEnds: { source: namingOf(source), target: namingOf(target) } }
            : {}),
    };
}

/** The merge pane's names, which hand themselves to `config` once the pane's canvas exists. */
export function createMergeElementNamesModule(config: MergeElementNamesConfig) {
    return {
        __depends__: [TranslateModule],
        __init__: ["mergeElementNames"],
        mergeElementNames: ["type", MergeElementNames],
        mergeElementNamesConfig: ["value", config],
    };
}
