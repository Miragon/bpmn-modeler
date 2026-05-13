/**
 * Extracts the referenced process / decision id from a Call Activity or
 * Business Rule Task business object.
 *
 * Camunda 7 stores the reference directly as an attribute on the BPMN
 * element (`calledElement` / `camunda:decisionRef`).  Camunda 8 wraps it in a
 * `zeebe:calledElement` / `zeebe:calledDecision` extension element.  Both
 * shapes are checked so the caller does not need to know the active engine.
 */

export type ReferenceKind = "process" | "decision";

/**
 * The shape this module needs from a bpmn-js business object.  Kept loose so
 * the code remains decoupled from bpmn-moddle types — we only care about
 * `get()` and the optional `extensionElements.values` list.
 */
export interface BusinessObjectLike {
    get(attr: string): unknown;
    extensionElements?: { values?: ExtensionElementLike[] };
}

export interface ExtensionElementLike {
    $type?: string;
    processId?: string;
    decisionId?: string;
}

/**
 * Looks up the first extension element whose `$type` matches `type`.
 *
 * @param businessObject Business object to inspect.
 * @param type Fully-qualified moddle type, e.g. `"zeebe:CalledElement"`.
 */
function findExtensionElement(
    businessObject: BusinessObjectLike,
    type: string,
): ExtensionElementLike | undefined {
    const values = businessObject.extensionElements?.values;
    if (!values) {
        return undefined;
    }
    return values.find((extensionElement) => extensionElement.$type === type);
}

/**
 * Resolves the referenced process / decision id for a Call Activity or
 * Business Rule Task.  Returns `undefined` when the element has no reference
 * set or the reference is empty.
 *
 * @param businessObject Business object of the selected element.
 * @param kind `"process"` for Call Activities, `"decision"` for Business Rule Tasks.
 */
export function extractReference(
    businessObject: BusinessObjectLike | undefined,
    kind: ReferenceKind,
): string | undefined {
    if (!businessObject) {
        return undefined;
    }

    if (kind === "process") {
        // Camunda 7: <bpmn:callActivity calledElement="…">
        const camunda7Reference = businessObject.get("calledElement");
        if (typeof camunda7Reference === "string" && camunda7Reference.length > 0) {
            return camunda7Reference;
        }
        // Camunda 8: <zeebe:calledElement processId="…">
        const camunda8Reference = findExtensionElement(businessObject, "zeebe:CalledElement");
        if (camunda8Reference?.processId) {
            return camunda8Reference.processId;
        }
        return undefined;
    }

    // Camunda 7: <bpmn:businessRuleTask camunda:decisionRef="…">
    const camunda7Reference = businessObject.get("camunda:decisionRef");
    if (typeof camunda7Reference === "string" && camunda7Reference.length > 0) {
        return camunda7Reference;
    }
    // Camunda 8: <zeebe:calledDecision decisionId="…">
    const camunda8Reference = findExtensionElement(businessObject, "zeebe:CalledDecision");
    if (camunda8Reference?.decisionId) {
        return camunda8Reference.decisionId;
    }
    return undefined;
}
