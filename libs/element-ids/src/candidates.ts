import type { ElementIdKind } from "@miragon/bpmn-modeler-types";

import { elementKindOf } from "./elementKinds";
import type { ModdleElementLike } from "./moddleElement";
import type { IdCandidate } from "./proposals";

/** The slice of a diagram-js element the review reads. */
export interface DiagramElementLike {
    readonly id: string;
    readonly type: string;
    readonly businessObject?: ModdleElementLike;
    readonly labelTarget?: unknown;
    readonly label?: DiagramElementLike;
    readonly di?: { readonly id?: string };
}

export interface ElementRegistryLike {
    getAll(): DiagramElementLike[];
    get(id: string): DiagramElementLike | undefined;
}

/**
 * What a rename changes: a diagram element, or the process behind a pool,
 * which has no diagram element of its own.
 */
export type RenameTarget =
    | { readonly kind: "element"; readonly element: DiagramElementLike }
    | {
          readonly kind: "process";
          readonly participant: DiagramElementLike;
          readonly process: ModdleElementLike;
      };

export interface ElementIdCandidate extends IdCandidate {
    readonly kind: ElementIdKind;
    readonly target: RenameTarget;
    /** The element to select when the row is picked. */
    readonly shown: DiagramElementLike;
}

// Elements that carry no name of their own: their text lives elsewhere or they have none.
const UNNAMED_TYPES = new Set([
    "bpmn:Association",
    "bpmn:DataInputAssociation",
    "bpmn:DataOutputAssociation",
    "bpmn:TextAnnotation",
    "bpmn:Group",
    "bpmn:Collaboration",
]);

/** Every element whose ID can follow a name, in registry order, each business object once. */
export function collectCandidates(registry: ElementRegistryLike): ElementIdCandidate[] {
    const seen = new Set<ModdleElementLike>();
    const candidates: ElementIdCandidate[] = [];

    const add = (
        businessObject: ModdleElementLike,
        target: RenameTarget,
        shown: DiagramElementLike,
        name?: string,
    ) => {
        if (seen.has(businessObject) || businessObject.id === undefined) {
            return;
        }
        seen.add(businessObject);
        candidates.push({
            id: businessObject.id,
            name: name ?? businessObject.name ?? "",
            type: businessObject.$type,
            element: businessObject,
            kind: elementKindOf(businessObject.$type),
            target,
            shown,
        });
    };

    for (const element of registry.getAll()) {
        const businessObject = element.businessObject;
        // A label shares its element's business object, and so does the plane of a collapsed sub-process.
        if (!businessObject || element.labelTarget || element.id !== businessObject.id) {
            continue;
        }
        if (UNNAMED_TYPES.has(businessObject.$type)) {
            continue;
        }
        add(businessObject, { kind: "element", element }, element);

        const process = businessObject.processRef;
        if (businessObject.$type === "bpmn:Participant" && process) {
            // A pool's process rarely has a name of its own; the pool's name stands in.
            add(
                process,
                { kind: "process", participant: element, process },
                element,
                process.name || businessObject.name,
            );
        }
    }
    return candidates;
}
