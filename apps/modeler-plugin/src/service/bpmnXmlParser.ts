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
import {
    RawActivityExtraction,
    RawImplementationRef,
    RawIOParameter,
} from "../domain/implementation";

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

// ─── Extended extraction (with I/O parameters) ──────────────────────────────

/**
 * Parses BPMN XML and extracts full activity details including implementation
 * references and I/O parameters.
 *
 * Supports:
 * - C7: `camunda:inputOutput > camunda:inputParameter / camunda:outputParameter`
 * - C8: `zeebe:ioMapping > zeebe:input / zeebe:output`
 *
 * @param xml Raw BPMN 2.0 XML string.
 * @returns Array of activity extractions with implementation refs and I/O params.
 */
export function extractActivityDetails(xml: string): RawActivityExtraction[] {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const results: RawActivityExtraction[] = [];

    for (const localName of TASK_LOCAL_NAMES) {
        const elements = doc.getElementsByTagNameNS(NS_BPMN, localName);
        for (let i = 0; i < elements.length; i++) {
            const el = elements.item(i);
            if (!el) continue;

            const activityId = el.getAttribute("id");
            if (!activityId) continue;

            const activityName = el.getAttribute("name") ?? "";
            const implementation = extractFromElement(el, activityId);
            const { inputs, outputs } = extractIOParameters(el);

            results.push({
                activityId,
                activityName,
                implementation,
                inputs,
                outputs,
            });
        }
    }

    return results;
}

/**
 * Extracts the process ID from the first `<bpmn:process>` element.
 *
 * @param xml Raw BPMN 2.0 XML string.
 * @returns The process ID, or `"unknown"` if not found.
 */
export function extractProcessId(xml: string): string {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const processes = doc.getElementsByTagNameNS(NS_BPMN, "process");
    for (let i = 0; i < processes.length; i++) {
        const p = processes.item(i);
        const id = p?.getAttribute("id");
        if (id) return id;
    }
    return "unknown";
}

/**
 * Detects the engine variant from the BPMN XML by checking for Zeebe or
 * Camunda namespace usage.
 *
 * @param xml Raw BPMN 2.0 XML string.
 * @returns `"c8"` if Zeebe elements are found, `"c7"` otherwise.
 */
export function detectEngine(xml: string): "c7" | "c8" {
    const doc = new DOMParser().parseFromString(xml, "text/xml");

    // Check for any Zeebe namespace elements (taskDefinition, ioMapping, etc.)
    const zeebeElements = doc.getElementsByTagNameNS(NS_ZEEBE, "*");
    if (zeebeElements.length > 0) {
        return "c8";
    }
    return "c7";
}

/**
 * Extracts I/O parameters from a BPMN task element's extension elements.
 *
 * Checks both C7 (`camunda:inputOutput`) and C8 (`zeebe:ioMapping`) patterns.
 *
 * @param taskEl The BPMN task DOM element.
 * @returns Object containing input and output parameter arrays.
 */
function extractIOParameters(taskEl: Element): {
    inputs: RawIOParameter[];
    outputs: RawIOParameter[];
} {
    const inputs: RawIOParameter[] = [];
    const outputs: RawIOParameter[] = [];

    const extensionElements = taskEl.getElementsByTagNameNS(NS_BPMN, "extensionElements");
    for (let i = 0; i < extensionElements.length; i++) {
        const extEl = extensionElements.item(i);
        if (!extEl) continue;

        // C7: camunda:inputOutput > camunda:inputParameter / camunda:outputParameter
        extractCamundaIO(extEl, inputs, outputs);

        // C8: zeebe:ioMapping > zeebe:input / zeebe:output
        extractZeebeIO(extEl, inputs, outputs);
    }

    return { inputs, outputs };
}

/**
 * Extracts C7 I/O parameters from `camunda:inputOutput` blocks.
 *
 * @param extEl The `bpmn:extensionElements` DOM element.
 * @param inputs Array to push input parameters into.
 * @param outputs Array to push output parameters into.
 */
function extractCamundaIO(
    extEl: Element,
    inputs: RawIOParameter[],
    outputs: RawIOParameter[],
): void {
    const ioBlocks = extEl.getElementsByTagNameNS(NS_CAMUNDA, "inputOutput");
    for (let i = 0; i < ioBlocks.length; i++) {
        const ioBlock = ioBlocks.item(i);
        if (!ioBlock) continue;

        const inputParams = ioBlock.getElementsByTagNameNS(NS_CAMUNDA, "inputParameter");
        for (let j = 0; j < inputParams.length; j++) {
            const param = inputParams.item(j);
            const name = param?.getAttribute("name");
            if (name) {
                const value = param?.textContent?.trim() || undefined;
                inputs.push({ name, direction: "input", value });
            }
        }

        const outputParams = ioBlock.getElementsByTagNameNS(NS_CAMUNDA, "outputParameter");
        for (let j = 0; j < outputParams.length; j++) {
            const param = outputParams.item(j);
            const name = param?.getAttribute("name");
            if (name) {
                const value = param?.textContent?.trim() || undefined;
                outputs.push({ name, direction: "output", value });
            }
        }
    }
}

/**
 * Extracts C8 I/O parameters from `zeebe:ioMapping` blocks.
 *
 * @param extEl The `bpmn:extensionElements` DOM element.
 * @param inputs Array to push input parameters into.
 * @param outputs Array to push output parameters into.
 */
function extractZeebeIO(
    extEl: Element,
    inputs: RawIOParameter[],
    outputs: RawIOParameter[],
): void {
    const ioMappings = extEl.getElementsByTagNameNS(NS_ZEEBE, "ioMapping");
    for (let i = 0; i < ioMappings.length; i++) {
        const ioMapping = ioMappings.item(i);
        if (!ioMapping) continue;

        const zeebeInputs = ioMapping.getElementsByTagNameNS(NS_ZEEBE, "input");
        for (let j = 0; j < zeebeInputs.length; j++) {
            const param = zeebeInputs.item(j);
            const target = param?.getAttribute("target");
            if (target) {
                const source = param?.getAttribute("source") || undefined;
                inputs.push({ name: target, direction: "input", value: source });
            }
        }

        const zeebeOutputs = ioMapping.getElementsByTagNameNS(NS_ZEEBE, "output");
        for (let j = 0; j < zeebeOutputs.length; j++) {
            const param = zeebeOutputs.item(j);
            const target = param?.getAttribute("target");
            if (target) {
                const source = param?.getAttribute("source") || undefined;
                outputs.push({ name: target, direction: "output", value: source });
            }
        }
    }
}
