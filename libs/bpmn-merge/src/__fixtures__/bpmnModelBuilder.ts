import {
    ENGINE_EXECUTION_PLATFORM,
    ENGINE_NAMESPACE,
    type Engine,
    MODELER_NAMESPACE_URI,
} from "@miragon/bpmn-modeler-types/engine";

/** Extension XML the builder writes as given, unknown to it. */
export interface XmlElement {
    readonly tag: string;
    readonly attributes?: Readonly<Record<string, string>>;
    readonly children?: readonly XmlElement[];
    readonly text?: string;
}

type EventDefinition =
    | { readonly kind: "message"; readonly id: string; readonly ref?: string }
    | { readonly kind: "error"; readonly id: string; readonly ref?: string }
    | { readonly kind: "signal"; readonly id: string; readonly ref?: string }
    | { readonly kind: "escalation"; readonly id: string; readonly ref?: string }
    | { readonly kind: "compensate"; readonly id: string; readonly ref?: string }
    | { readonly kind: "timer"; readonly id: string; readonly duration: string };

type FlowNodeType =
    | "task"
    | "serviceTask"
    | "userTask"
    | "subProcess"
    | "startEvent"
    | "endEvent"
    | "intermediateThrowEvent"
    | "intermediateCatchEvent"
    | "boundaryEvent"
    | "exclusiveGateway"
    | "parallelGateway"
    | "dataObjectReference"
    | "dataStoreReference"
    | "textAnnotation";

export interface FixtureNode {
    id: string;
    type: FlowNodeType;
    name?: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
    /** The sub-process or process holding the node; the main process when absent. */
    parent?: string;
    /** Only for nodes directly in the main process; nested nodes sit in their top-level ancestor's lane. */
    lane?: string;
    attachedTo?: string;
    interrupting?: boolean;
    default?: string;
    dataObject?: string;
    dataStore?: string;
    forCompensation?: boolean;
    /** A sub-process drawn as a collapsed shape, its contents on a diagram of its own. */
    collapsed?: boolean;
    /** Written by tools other than bpmn-js, which derives it from `attachedTo`. */
    boundaryEventRefs?: string[];
    /** Engine and unknown namespaced attributes, written after the BPMN ones in this order. */
    attributes?: Record<string, string>;
    extensionElements?: XmlElement[];
    text?: string;
    eventDefinition?: EventDefinition;
}

type FlowKind = "sequence" | "message" | "association" | "dataInput" | "dataOutput";

interface FixtureFlow {
    id: string;
    kind?: FlowKind;
    source: string;
    target: string;
    name?: string;
    condition?: string;
    message?: string;
    direction?: "None" | "One" | "Both";
    /** For a data input: the placeholder property bpmn-js adds to the target activity as the association's target. */
    targetProperty?: string;
    waypoints?: (readonly [number, number])[];
}

interface FixtureBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface FixtureLane extends FixtureBounds {
    id: string;
    name?: string;
}

interface FixturePool extends FixtureBounds {
    id: string;
    name?: string;
    /** Absent for a black-box pool. */
    process?: string;
}

interface FixtureRoot {
    type: "message" | "error" | "signal" | "escalation" | "dataStore" | "interface";
    id: string;
    name?: string;
    /** errorCode or escalationCode. */
    code?: string;
    /** For an interface. */
    operations?: { id: string; name?: string }[];
}

interface FixtureDataObject {
    id: string;
    parent?: string;
}

export interface BpmnFixtureModel {
    platform: Engine;
    /** Prefix to URI, declared after the BPMN, DI and engine namespaces. */
    namespaces: Record<string, string>;
    roots: FixtureRoot[];
    pools: FixturePool[];
    lanes: FixtureLane[];
    dataObjects: FixtureDataObject[];
    nodes: FixtureNode[];
    flows: FixtureFlow[];
    /** Engine and unknown namespaced attributes of the main process. */
    processAttributes?: Record<string, string>;
}

const MAIN_PROCESS = "Process_1";

const STANDARD_NAMESPACES: Readonly<Record<string, string>> = {
    bpmn: "http://www.omg.org/spec/BPMN/20100524/MODEL",
    bpmndi: "http://www.omg.org/spec/BPMN/20100524/DI",
    dc: "http://www.omg.org/spec/DD/20100524/DC",
    di: "http://www.omg.org/spec/DD/20100524/DI",
    xsi: "http://www.w3.org/2001/XMLSchema-instance",
};

const EXECUTION_PLATFORM_VERSION: Readonly<Record<Engine, string>> = {
    c7: "7.23.0",
    c8: "8.6.0",
};

const DEFAULT_SIZE: Partial<Record<FlowNodeType, readonly [number, number]>> = {
    startEvent: [36, 36],
    endEvent: [36, 36],
    intermediateThrowEvent: [36, 36],
    intermediateCatchEvent: [36, 36],
    boundaryEvent: [36, 36],
    exclusiveGateway: [50, 50],
    parallelGateway: [50, 50],
    dataObjectReference: [36, 50],
    dataStoreReference: [50, 50],
    textAnnotation: [100, 30],
};

const ARTIFACT_TYPES: ReadonlySet<FlowNodeType> = new Set(["textAnnotation"]);

const EVENT_DEFINITION_REFERENCE: Readonly<Record<EventDefinition["kind"], string | undefined>> = {
    message: "messageRef",
    error: "errorRef",
    signal: "signalRef",
    escalation: "escalationRef",
    compensate: "activityRef",
    timer: undefined,
};

function element(
    tag: string,
    attributes: Record<string, string | undefined> = {},
    children: readonly XmlElement[] = [],
    text?: string,
): XmlElement {
    const definedAttributes = Object.fromEntries(
        Object.entries(attributes).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
        ),
    );
    return { tag, attributes: definedAttributes, children, text };
}

const escapeAttribute = (value: string) =>
    value.replace(/\n\r|[\n"'<>&]/g, (character) => `&#${character.charCodeAt(0)};`);
const escapeBody = (value: string) =>
    value.replace(
        /[<>&]/g,
        (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[character] ?? character,
    );

/** Writes as moddle's `toXML({ format: true })` does: two-space indent, one element per line. */
function writeElement(xmlElement: XmlElement, depth: number): string[] {
    const indent = "  ".repeat(depth);
    const attributeText = Object.entries(xmlElement.attributes ?? {})
        .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
        .join("");
    const open = `${indent}<${xmlElement.tag}${attributeText}`;
    if (xmlElement.text !== undefined) {
        return [`${open}>${escapeBody(xmlElement.text)}</${xmlElement.tag}>`];
    }
    const children = xmlElement.children ?? [];
    if (children.length === 0) {
        return [`${open} />`];
    }
    return [
        `${open}>`,
        ...children.flatMap((child) => writeElement(child, depth + 1)),
        `${indent}</${xmlElement.tag}>`,
    ];
}

function sizeOf(node: FixtureNode): readonly [number, number] {
    const [defaultWidth, defaultHeight] = DEFAULT_SIZE[node.type] ?? [100, 80];
    return [node.width ?? defaultWidth, node.height ?? defaultHeight];
}

function centerOf(bounds: FixtureBounds): readonly [number, number] {
    return [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
}

function nodeBounds(node: FixtureNode): FixtureBounds {
    const [width, height] = sizeOf(node);
    return { x: node.x, y: node.y, width, height };
}

const flowKind = (flow: FixtureFlow): FlowKind => flow.kind ?? "sequence";

function scopeOf(model: BpmnFixtureModel, nodeId: string): string {
    return model.nodes.find((node) => node.id === nodeId)?.parent ?? MAIN_PROCESS;
}

function topLevelAncestor(model: BpmnFixtureModel, node: FixtureNode): FixtureNode {
    const parent = model.nodes.find((candidate) => candidate.id === node.parent);
    return parent ? topLevelAncestor(model, parent) : node;
}

function eventDefinitionElement(definition: EventDefinition): XmlElement {
    const tag = `bpmn:${definition.kind}EventDefinition`;
    if (definition.kind === "timer") {
        return element(tag, { id: definition.id }, [
            element(
                "bpmn:timeDuration",
                { "xsi:type": "bpmn:tFormalExpression" },
                [],
                definition.duration,
            ),
        ]);
    }
    const referenceAttribute = EVENT_DEFINITION_REFERENCE[definition.kind] as string;
    return element(tag, { id: definition.id, [referenceAttribute]: definition.ref });
}

function referenceElement(tag: string, id: string): XmlElement {
    return element(tag, {}, [], id);
}

function dataInputsOf(model: BpmnFixtureModel, node: FixtureNode): FixtureFlow[] {
    return model.flows.filter((flow) => flowKind(flow) === "dataInput" && flow.target === node.id);
}

function placeholderPropertyElements(model: BpmnFixtureModel, node: FixtureNode): XmlElement[] {
    return dataInputsOf(model, node).flatMap((flow) =>
        flow.targetProperty === undefined
            ? []
            : [
                  element("bpmn:property", {
                      id: flow.targetProperty,
                      name: "__targetRef_placeholder",
                  }),
              ],
    );
}

function dataAssociationElements(model: BpmnFixtureModel, node: FixtureNode): XmlElement[] {
    const inputs = dataInputsOf(model, node).map((flow) =>
        element("bpmn:dataInputAssociation", { id: flow.id }, [
            referenceElement("bpmn:sourceRef", flow.source),
            ...(flow.targetProperty === undefined
                ? []
                : [referenceElement("bpmn:targetRef", flow.targetProperty)]),
        ]),
    );
    const outputs = model.flows
        .filter((flow) => flowKind(flow) === "dataOutput" && flow.source === node.id)
        .map((flow) =>
            element("bpmn:dataOutputAssociation", { id: flow.id }, [
                referenceElement("bpmn:targetRef", flow.target),
            ]),
        );
    return [...inputs, ...outputs];
}

function nodeAttributes(node: FixtureNode): Record<string, string | undefined> {
    return {
        id: node.id,
        name: node.name,
        isForCompensation: node.forCompensation ? "true" : undefined,
        default: node.default,
        cancelActivity: node.attachedTo && node.interrupting === false ? "false" : undefined,
        attachedToRef: node.attachedTo,
        dataObjectRef: node.dataObject,
        dataStoreRef: node.dataStore,
        ...node.attributes,
    };
}

function nodeElement(model: BpmnFixtureModel, node: FixtureNode): XmlElement {
    const sequenceFlows = model.flows.filter((flow) => flowKind(flow) === "sequence");
    const children = [
        ...(node.text === undefined ? [] : [element("bpmn:text", {}, [], node.text)]),
        ...(node.extensionElements?.length
            ? [element("bpmn:extensionElements", {}, node.extensionElements)]
            : []),
        ...sequenceFlows
            .filter((flow) => flow.target === node.id)
            .map((flow) => referenceElement("bpmn:incoming", flow.id)),
        ...sequenceFlows
            .filter((flow) => flow.source === node.id)
            .map((flow) => referenceElement("bpmn:outgoing", flow.id)),
        ...(node.boundaryEventRefs ?? []).map((id) =>
            referenceElement("bpmn:boundaryEventRefs", id),
        ),
        ...placeholderPropertyElements(model, node),
        ...dataAssociationElements(model, node),
        ...(node.type === "subProcess" ? scopeElements(model, node.id) : []),
        ...(node.eventDefinition ? [eventDefinitionElement(node.eventDefinition)] : []),
    ];
    return element(`bpmn:${node.type}`, nodeAttributes(node), children);
}

function flowElement(flow: FixtureFlow): XmlElement {
    if (flowKind(flow) === "association") {
        return element("bpmn:association", {
            id: flow.id,
            associationDirection: flow.direction,
            sourceRef: flow.source,
            targetRef: flow.target,
        });
    }
    const condition =
        flow.condition === undefined
            ? []
            : [
                  element(
                      "bpmn:conditionExpression",
                      { "xsi:type": "bpmn:tFormalExpression" },
                      [],
                      flow.condition,
                  ),
              ];
    return element(
        "bpmn:sequenceFlow",
        { id: flow.id, name: flow.name, sourceRef: flow.source, targetRef: flow.target },
        condition,
    );
}

/** Flow elements in model order (data objects, nodes, sequence flows), then artifacts, as moddle writes them. */
function scopeElements(model: BpmnFixtureModel, scopeId: string): XmlElement[] {
    const nodesInScope = model.nodes.filter((node) => (node.parent ?? MAIN_PROCESS) === scopeId);
    const flowsInScope = model.flows.filter((flow) => scopeOf(model, flow.source) === scopeId);
    return [
        ...model.dataObjects
            .filter((dataObject) => (dataObject.parent ?? MAIN_PROCESS) === scopeId)
            .map((dataObject) => element("bpmn:dataObject", { id: dataObject.id })),
        ...nodesInScope
            .filter((node) => !ARTIFACT_TYPES.has(node.type))
            .map((node) => nodeElement(model, node)),
        ...flowsInScope.filter((flow) => flowKind(flow) === "sequence").map(flowElement),
        ...nodesInScope
            .filter((node) => ARTIFACT_TYPES.has(node.type))
            .map((node) => nodeElement(model, node)),
        ...flowsInScope.filter((flow) => flowKind(flow) === "association").map(flowElement),
    ];
}

function laneSetElement(model: BpmnFixtureModel): XmlElement[] {
    if (model.lanes.length === 0) {
        return [];
    }
    const laneOf = (node: FixtureNode) => topLevelAncestor(model, node).lane;
    const topLevelFirst = [
        ...model.nodes.filter((node) => node.parent === undefined),
        ...model.nodes.filter((node) => node.parent !== undefined),
    ];
    const lanes = model.lanes.map((lane) =>
        element(
            "bpmn:lane",
            { id: lane.id, name: lane.name },
            topLevelFirst
                .filter((node) => !ARTIFACT_TYPES.has(node.type) && laneOf(node) === lane.id)
                .map((node) => referenceElement("bpmn:flowNodeRef", node.id)),
        ),
    );
    return [element("bpmn:laneSet", { id: "LaneSet_1" }, lanes)];
}

function rootElement(root: FixtureRoot): XmlElement {
    return element(
        `bpmn:${root.type}`,
        {
            id: root.id,
            name: root.name,
            errorCode: root.type === "error" ? root.code : undefined,
            escalationCode: root.type === "escalation" ? root.code : undefined,
        },
        (root.operations ?? []).map((operation) => element("bpmn:operation", operation)),
    );
}

function collaborationElements(model: BpmnFixtureModel): XmlElement[] {
    if (model.pools.length === 0) {
        return [];
    }
    const participants = model.pools.map((pool) =>
        element("bpmn:participant", { id: pool.id, name: pool.name, processRef: pool.process }),
    );
    const messageFlows = model.flows
        .filter((flow) => flowKind(flow) === "message")
        .map((flow) =>
            element("bpmn:messageFlow", {
                id: flow.id,
                name: flow.name,
                sourceRef: flow.source,
                targetRef: flow.target,
                messageRef: flow.message,
            }),
        );
    return [
        element("bpmn:collaboration", { id: "Collaboration_1" }, [
            ...participants,
            ...messageFlows,
        ]),
    ];
}

function processElements(model: BpmnFixtureModel): XmlElement[] {
    const mainProcess = element(
        "bpmn:process",
        { id: MAIN_PROCESS, isExecutable: "true", ...model.processAttributes },
        [...laneSetElement(model), ...scopeElements(model, MAIN_PROCESS)],
    );
    const otherProcesses = model.pools
        .flatMap((pool) => (pool.process && pool.process !== MAIN_PROCESS ? [pool.process] : []))
        .map((processId) =>
            element(
                "bpmn:process",
                { id: processId, isExecutable: "false" },
                scopeElements(model, processId),
            ),
        );
    return [mainProcess, ...otherProcesses];
}

function shapeElement(
    id: string,
    bounds: FixtureBounds,
    attributes: Record<string, string> = {},
): XmlElement {
    return element("bpmndi:BPMNShape", { id: `${id}_di`, bpmnElement: id, ...attributes }, [
        element("dc:Bounds", {
            x: String(bounds.x),
            y: String(bounds.y),
            width: String(bounds.width),
            height: String(bounds.height),
        }),
    ]);
}

function boundsOf(model: BpmnFixtureModel, id: string): FixtureBounds | undefined {
    const node = model.nodes.find((candidate) => candidate.id === id);
    return node ? nodeBounds(node) : model.pools.find((pool) => pool.id === id);
}

function waypointsOf(
    model: BpmnFixtureModel,
    flow: FixtureFlow,
): readonly (readonly [number, number])[] {
    if (flow.waypoints) {
        return flow.waypoints;
    }
    const source = boundsOf(model, flow.source);
    const target = boundsOf(model, flow.target);
    if (!source || !target) {
        return [
            [0, 0],
            [10, 10],
        ];
    }
    const [sourceX, sourceY] = centerOf(source);
    const [targetX, targetY] = centerOf(target);
    if (sourceY === targetY) {
        return [
            [source.x + source.width, sourceY],
            [target.x, targetY],
        ];
    }
    return [
        [sourceX, sourceY],
        [sourceX, targetY],
        [targetX, targetY],
    ];
}

function edgeElement(model: BpmnFixtureModel, flow: FixtureFlow): XmlElement {
    return element(
        "bpmndi:BPMNEdge",
        { id: `${flow.id}_di`, bpmnElement: flow.id },
        waypointsOf(model, flow).map(([x, y]) =>
            element("di:waypoint", { x: String(x), y: String(y) }),
        ),
    );
}

/** The collapsed sub-process whose own diagram draws the node, or undefined for the main diagram. */
function planeOf(model: BpmnFixtureModel, nodeId: string): string | undefined {
    const parent = model.nodes.find((node) => node.id === nodeId)?.parent;
    const parentNode = model.nodes.find((node) => node.id === parent);
    if (!parentNode) {
        return undefined;
    }
    return parentNode.collapsed ? parentNode.id : planeOf(model, parentNode.id);
}

function planeContentOf(model: BpmnFixtureModel, plane: string | undefined): XmlElement[] {
    const nodeShape = (node: FixtureNode) =>
        shapeElement(
            node.id,
            nodeBounds(node),
            node.type === "subProcess" && !node.collapsed ? { isExpanded: "true" } : {},
        );
    const nodes = model.nodes.filter((node) => planeOf(model, node.id) === plane);
    const flowEnd = (flow: FixtureFlow) =>
        flowKind(flow) === "dataInput" ? flow.target : flow.source;
    return [
        ...(plane === undefined
            ? [
                  ...model.pools.map((pool) =>
                      shapeElement(pool.id, pool, { isHorizontal: "true" }),
                  ),
                  ...model.lanes.map((lane) =>
                      shapeElement(lane.id, lane, { isHorizontal: "true" }),
                  ),
              ]
            : []),
        ...nodes.filter((node) => node.type !== "boundaryEvent").map(nodeShape),
        ...nodes.filter((node) => node.type === "boundaryEvent").map(nodeShape),
        ...model.flows
            .filter((flow) => planeOf(model, flowEnd(flow)) === plane)
            .map((flow) => edgeElement(model, flow)),
    ];
}

/** The main diagram, then one per collapsed sub-process, as bpmn-js writes them. */
function diagramElements(model: BpmnFixtureModel): XmlElement[] {
    const mainOwner = model.pools.length > 0 ? "Collaboration_1" : MAIN_PROCESS;
    const diagram = (suffix: string, owner: string, content: XmlElement[]) =>
        element("bpmndi:BPMNDiagram", { id: `BPMNDiagram_${suffix}` }, [
            element("bpmndi:BPMNPlane", { id: `BPMNPlane_${suffix}`, bpmnElement: owner }, content),
        ]);
    return [
        diagram("1", mainOwner, planeContentOf(model, undefined)),
        ...model.nodes
            .filter((node) => node.collapsed)
            .map((node) => diagram(node.id, node.id, planeContentOf(model, node.id))),
    ];
}

/** moddle drops the engine namespace when nothing uses it, as it does for every namespace it has a descriptor for. */
function definitionsAttributes(
    model: BpmnFixtureModel,
    usesEngineNamespace: boolean,
): Record<string, string> {
    const { prefix, uri } = ENGINE_NAMESPACE[model.platform];
    const engineDeclaration = usesEngineNamespace ? { [prefix]: uri } : {};
    const namespaceDeclarations = Object.entries({
        ...STANDARD_NAMESPACES,
        ...engineDeclaration,
        modeler: MODELER_NAMESPACE_URI,
        ...model.namespaces,
    }).map(([prefix, uri]) => [`xmlns:${prefix}`, uri]);
    return {
        ...Object.fromEntries(namespaceDeclarations),
        "id": "Definitions_1",
        "targetNamespace": "http://bpmn.io/schema/bpmn",
        "exporter": "Camunda Modeler",
        "exporterVersion": "5.40.0",
        "modeler:executionPlatform": ENGINE_EXECUTION_PLATFORM[model.platform],
        "modeler:executionPlatformVersion": EXECUTION_PLATFORM_VERSION[model.platform],
    };
}

/** The model as BPMN XML with full DI, byte-identical to what the modeler's save writes for it. */
export function renderBpmn(model: BpmnFixtureModel): string {
    const content = [
        ...model.roots.map(rootElement),
        ...collaborationElements(model),
        ...processElements(model),
        ...diagramElements(model),
    ];
    const enginePrefix = `${ENGINE_NAMESPACE[model.platform].prefix}:`;
    const usesEngineNamespace = content
        .flatMap((child) => writeElement(child, 0))
        .some((line) => line.includes(`<${enginePrefix}`) || line.includes(` ${enginePrefix}`));
    const definitions = element(
        "bpmn:definitions",
        definitionsAttributes(model, usesEngineNamespace),
        content,
    );
    return ['<?xml version="1.0" encoding="UTF-8"?>', ...writeElement(definitions, 0), ""].join(
        "\n",
    );
}
