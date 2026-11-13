/**
 * Extracts process, decision, and Camunda Form references from BPMN business
 * objects.
 *
 * Camunda 7 stores the reference directly as an attribute on the BPMN
 * element (`calledElement` / `camunda:decisionRef`).  Camunda 8 wraps it in a
 * `zeebe:calledElement` / `zeebe:calledDecision` extension element.  Both
 * shapes are checked so the caller does not need to know the active engine.
 * Camunda 8 linked forms use `zeebe:formDefinition formId`.
 */

import { is } from "bpmn-js/lib/util/ModelUtil";

import type { ReferenceKind } from "@miragon/bpmn-modeler-types";

import type { ModelReference } from "./ModelNavigationPort";
import { resolveQualifiedReference, type ModdleElementLike } from "./qualifiedReference";

/**
 * The shape this module needs from a bpmn-js business object.  Kept loose so
 * the code remains decoupled from bpmn-moddle types — we only care about
 * `get()` and the optional `extensionElements.values` list.
 */
export interface BusinessObjectLike extends ModdleElementLike {
    get(attr: string): unknown;
    extensionElements?: { values?: ExtensionElementLike[] };
}

interface ExtensionElementLike {
    $type?: string;
    processId?: string;
    decisionId?: string;
    formId?: string;
}

/** Which element holds a reference of one kind, and where it writes it. */
interface ReferenceSource {
    /** The BPMN type of the element that holds the reference. */
    readonly elementType: string;
    /** The Camunda 7 attribute on the element itself. */
    readonly attribute?: string;
    /** The Camunda 8 extension element and its property that holds the id. */
    readonly extensionElement: {
        readonly type: string;
        readonly property: Exclude<keyof ExtensionElementLike, "$type">;
    };
    /** BPMN types `calledElement` as `xsd:QName`, so a prefix resolves to a namespace. */
    readonly qualifiedName: boolean;
}

const REFERENCE_SOURCES: Readonly<Record<ReferenceKind, ReferenceSource>> = {
    process: {
        elementType: "bpmn:CallActivity",
        attribute: "calledElement",
        extensionElement: { type: "zeebe:CalledElement", property: "processId" },
        qualifiedName: true,
    },
    decision: {
        elementType: "bpmn:BusinessRuleTask",
        attribute: "camunda:decisionRef",
        extensionElement: { type: "zeebe:CalledDecision", property: "decisionId" },
        qualifiedName: false,
    },
    form: {
        elementType: "bpmn:UserTask",
        extensionElement: { type: "zeebe:FormDefinition", property: "formId" },
        qualifiedName: false,
    },
};

const REFERENCE_KINDS = Object.keys(REFERENCE_SOURCES) as ReferenceKind[];

/** The kind of model the element references, or `undefined` for an element that holds none. */
export function referenceKindOf(element: Parameters<typeof is>[0]): ReferenceKind | undefined {
    return REFERENCE_KINDS.find((kind) => is(element, REFERENCE_SOURCES[kind].elementType));
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

function nonEmptyString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Resolves the referenced process, decision, or form id. Returns `undefined`
 * when the element has no reference set or the reference is empty.
 *
 * @param businessObject Business object of the selected element.
 * @param kind Reference type selected by the context-pad provider.
 */
export function extractReference(
    businessObject: BusinessObjectLike | undefined,
    kind: ReferenceKind,
): string | undefined {
    if (!businessObject) {
        return undefined;
    }
    const { attribute, extensionElement } = REFERENCE_SOURCES[kind];
    const camunda7Reference =
        attribute === undefined ? undefined : nonEmptyString(businessObject.get(attribute));
    const camunda8Element = findExtensionElement(businessObject, extensionElement.type);
    return camunda7Reference ?? nonEmptyString(camunda8Element?.[extensionElement.property]);
}

/**
 * The reference the host navigates to. A process reference is a BPMN QName,
 * so its prefix is resolved to the namespace it is bound to.
 */
export function extractModelReference(
    businessObject: BusinessObjectLike | undefined,
    kind: ReferenceKind,
): ModelReference | undefined {
    const reference = extractReference(businessObject, kind);
    if (!businessObject || !reference) {
        return undefined;
    }
    return REFERENCE_SOURCES[kind].qualifiedName
        ? { ...resolveQualifiedReference(reference, businessObject), kind }
        : { id: reference, kind };
}
