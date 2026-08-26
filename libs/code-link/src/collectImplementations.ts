/**
 * Reads the diagram's implementation bindings straight off the bpmn-js model so
 * the host never has to parse the BPMN XML. bpmn-js already parsed the
 * (possibly huge) `.bpmn` to render it; this walks the resulting
 * `elementRegistry`, keeps the task types that can carry a Camunda
 * implementation, and turns each one into a cheap `(activityId, kind, reference)`
 * triple for {@link SyncActivitiesCommand}.
 */
import { is } from "bpmn-js/lib/util/ModelUtil";

import type { ImplementationEntry } from "@miragon/bpmn-modeler-types";

import { BusinessObjectLike, extractImplementation } from "./extractImplementation";

/**
 * The task types that can carry a Camunda implementation binding worth linking.
 * The single source of truth for both {@link collectImplementations} and the
 * context-pad provider, so the two never disagree about what is implementable.
 */
export const IMPLEMENTABLE_TYPES = ["bpmn:ServiceTask", "bpmn:SendTask", "bpmn:BusinessRuleTask"];

/** The minimal slice of a bpmn-js element this module reads. */
interface RegistryElement {
    id?: string;
    type?: string;
    businessObject?: BusinessObjectLike;
}

/** The slice of bpmn-js' `elementRegistry` this module needs. */
export interface ElementRegistryLike {
    getAll(): RegistryElement[];
}

/**
 * Collects one {@link ImplementationEntry} per implementable task that carries a
 * resolvable reference. Entries are sorted by activity id so the resulting list
 * is order-stable across calls — that lets the client cheaply skip re-sending an
 * unchanged diagram and gives the persisted artifact a deterministic ordering.
 *
 * @param elementRegistry bpmn-js' element registry for the live diagram.
 */
export function collectImplementations(
    elementRegistry: ElementRegistryLike,
): ImplementationEntry[] {
    const entries: ImplementationEntry[] = [];
    for (const element of elementRegistry.getAll()) {
        if (!element.id || !IMPLEMENTABLE_TYPES.some((type) => is(element, type))) {
            continue;
        }
        const implementation = extractImplementation(element.businessObject);
        if (!implementation) {
            continue;
        }
        entries.push({
            activityId: element.id,
            kind: implementation.kind,
            reference: implementation.reference,
        });
    }
    return entries.sort((a, b) => a.activityId.localeCompare(b.activityId));
}
