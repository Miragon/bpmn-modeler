/**
 * Extracts the Camunda implementation reference from a service / send /
 * business-rule task business object so the host can navigate to its source.
 *
 * Camunda 7 stores the binding directly as attributes on the BPMN element
 * (`camunda:class`, `camunda:delegateExpression`, `camunda:expression`, or
 * `camunda:type="external"` + `camunda:topic`). Camunda 8 wraps it in a
 * `zeebe:taskDefinition` extension element carrying a `type`. Both shapes are
 * checked so the caller does not need to know the active engine.
 *
 * A business-rule task that only carries `camunda:decisionRef` returns
 * `undefined` here — that DMN link is model-navigation's job, so the two
 * context-pad entries never collide.
 */
import type { ImplementationKind } from "@miragon/bpmn-modeler-shared";

export type { ImplementationKind };

/**
 * The shape this module needs from a bpmn-js business object. Kept loose so the
 * code stays decoupled from bpmn-moddle types — only `get()` and the optional
 * `extensionElements.values` list matter.
 */
export interface BusinessObjectLike {
    get(attr: string): unknown;
    extensionElements?: { values?: ExtensionElementLike[] };
}

export interface ExtensionElementLike {
    $type?: string;
    // `zeebe:TaskDefinition` carries the C8 job type here.
    type?: string;
}

/**
 * A resolved implementation reference: the raw reference string plus the
 * {@link ImplementationKind} that tells the host how to resolve it.
 */
export interface ImplementationReference {
    kind: ImplementationKind;
    reference: string;
}

function asNonEmptyString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

function findExtensionElement(
    businessObject: BusinessObjectLike,
    type: string,
): ExtensionElementLike | undefined {
    return businessObject.extensionElements?.values?.find((element) => element.$type === type);
}

/**
 * Classifies the selected element's implementation binding. C7 attributes are
 * checked before the C8 extension element; within C7 the order
 * class → delegate → expression → external matches the mutually-exclusive
 * "Implementation" dropdown so the first present attribute wins.
 *
 * @param businessObject Business object of the selected element.
 */
export function extractImplementation(
    businessObject: BusinessObjectLike | undefined,
): ImplementationReference | undefined {
    if (!businessObject) {
        return undefined;
    }

    const javaClass = asNonEmptyString(businessObject.get("camunda:class"));
    if (javaClass) {
        return { kind: "javaClass", reference: javaClass };
    }

    const delegateExpression = asNonEmptyString(businessObject.get("camunda:delegateExpression"));
    if (delegateExpression) {
        return { kind: "delegateExpression", reference: delegateExpression };
    }

    const expression = asNonEmptyString(businessObject.get("camunda:expression"));
    if (expression) {
        return { kind: "expression", reference: expression };
    }

    // C7 external task: the topic is meaningful only when the type is external.
    if (businessObject.get("camunda:type") === "external") {
        const topic = asNonEmptyString(businessObject.get("camunda:topic"));
        if (topic) {
            return { kind: "externalTopic", reference: topic };
        }
    }

    // C8: <zeebe:taskDefinition type="…">
    const taskDefinition = findExtensionElement(businessObject, "zeebe:TaskDefinition");
    const jobType = asNonEmptyString(taskDefinition?.type);
    if (jobType) {
        return { kind: "jobType", reference: jobType };
    }

    return undefined;
}
