/**
 * Pure-function BPMN XML parser that extracts service task implementation references.
 *
 * Supports both Camunda 7 and Camunda 8 patterns:
 *
 * | Engine | XML Pattern                                                   | Kind               | Identifier        |
 * |--------|---------------------------------------------------------------|--------------------|--------------------|
 * | C7     | `camunda:class="com.example.Foo"`                             | `javaClass`        | `com.example.Foo`  |
 * | C7     | `camunda:delegateExpression="${myBean}"`                       | `delegateExpression` | `${myBean}`      |
 * | C7     | `camunda:expression="${svc.run()}"`                            | `expression`       | `${svc.run()}`     |
 * | C7     | `camunda:type="external" camunda:topic="payment"`             | `externalTask`     | `payment`          |
 * | C8     | `<zeebe:taskDefinition type="payment-service"/>` in serviceTask | `jobType`         | `payment-service`  |
 *
 * Has no dependencies on VS Code APIs.
 */
import { DOMParser } from "@xmldom/xmldom";
import { RawImplementationRef } from "../domain/implementation";

/** Namespace URIs used in BPMN XML. */
const NS_BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const NS_CAMUNDA = "http://camunda.org/schema/1.0/bpmn";
const NS_ZEEBE = "http://camunda.org/schema/zeebe/1.0";

/** BPMN element local names that can carry implementation references. */
const TASK_LOCAL_NAMES = ["serviceTask", "sendTask", "businessRuleTask"];

/**
 * Parses BPMN XML and extracts all implementation references from tasks.
 *
 * @param xml Raw BPMN 2.0 XML string.
 * @returns Array of extracted references (activity ID, kind, identifier).
 */
export function extractImplementationRefs(xml: string): RawImplementationRef[] {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const refs: RawImplementationRef[] = [];

    for (const localName of TASK_LOCAL_NAMES) {
        const elements = doc.getElementsByTagNameNS(NS_BPMN, localName);
        for (let i = 0; i < elements.length; i++) {
            const el = elements.item(i);
            if (!el) continue;

            const activityId = el.getAttribute("id");
            if (!activityId) continue;

            const ref = extractFromElement(el, activityId);
            if (ref) {
                refs.push(ref);
            }
        }
    }

    return refs;
}

/**
 * Attempts to extract an implementation reference from a single BPMN task element.
 *
 * Checks Camunda 7 attributes first, then falls back to Camunda 8 child elements.
 *
 * @param el The BPMN task DOM element.
 * @param activityId The element's `id` attribute value.
 * @returns The extracted reference, or `undefined` if no implementation is configured.
 */
function extractFromElement(
    el: Element,
    activityId: string,
): RawImplementationRef | undefined {
    // C7: camunda:class
    const javaClass = el.getAttributeNS(NS_CAMUNDA, "class");
    if (javaClass) {
        return { activityId, kind: "javaClass", identifier: javaClass };
    }

    // C7: camunda:delegateExpression
    const delegateExpr = el.getAttributeNS(NS_CAMUNDA, "delegateExpression");
    if (delegateExpr) {
        return { activityId, kind: "delegateExpression", identifier: delegateExpr };
    }

    // C7: camunda:expression
    const expression = el.getAttributeNS(NS_CAMUNDA, "expression");
    if (expression) {
        return { activityId, kind: "expression", identifier: expression };
    }

    // C7: camunda:type="external" + camunda:topic
    const camundaType = el.getAttributeNS(NS_CAMUNDA, "type");
    const topic = el.getAttributeNS(NS_CAMUNDA, "topic");
    if (camundaType === "external" && topic) {
        return { activityId, kind: "externalTask", identifier: topic };
    }

    // C8: zeebe:taskDefinition type
    const zeebeRef = extractZeebeTaskDefinition(el);
    if (zeebeRef) {
        return { activityId, kind: "jobType", identifier: zeebeRef };
    }

    return undefined;
}

/**
 * Looks for a `<zeebe:taskDefinition type="..."/>` inside a BPMN extension elements block.
 *
 * @param taskEl The parent BPMN task element.
 * @returns The `type` attribute value, or `undefined` if not found.
 */
function extractZeebeTaskDefinition(taskEl: Element): string | undefined {
    const extensionElements = taskEl.getElementsByTagNameNS(NS_BPMN, "extensionElements");
    for (let i = 0; i < extensionElements.length; i++) {
        const extEl = extensionElements.item(i);
        if (!extEl) continue;

        const taskDefs = extEl.getElementsByTagNameNS(NS_ZEEBE, "taskDefinition");
        for (let j = 0; j < taskDefs.length; j++) {
            const td = taskDefs.item(j);
            const type = td?.getAttribute("type");
            if (type) {
                return type;
            }
        }
    }
    return undefined;
}
